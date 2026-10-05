"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { MatchState, SubHand } from "@/lib/game/reducer";
import {
  CLASS_DEFS,
  canSplitCards,
  computeHandValue,
  isNaturalBlackjack,
  UNDERDOG_HP,
} from "@/lib/game/engine";
import ChatPanel from "@/components/ChatPanel";

type MatchRow = {
  id: string;
  player_a: string;
  player_b: string | null;
  is_campaign: boolean;
  state: MatchState;
  finalized: boolean;
  updated_at: string;
  mode?: "pvp" | "campaign" | "random";
  bot_rating?: number | null;
  rewards?: {
    a?: {
      tokens: number;
      rating: number;
      bounty: number;
      streakBonus?: number;
    };
    b?: {
      tokens: number;
      rating: number;
      bounty: number;
      streakBonus?: number;
    };
  };
};

export default function GameBoard({
  matchId,
  userId,
}: {
  matchId: string;
  userId: string;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [row, setRow] = useState<MatchRow | null>(null);
  const [acting, setActing] = useState(false);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [rematchSent, setRematchSent] = useState(false);

  const [liveStatus, setLiveStatus] = useState<
    "connecting" | "live" | "fallback"
  >("connecting");

  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncInFlight = useRef(false);

  /**
   * Betrouwbare server-sync.
   *
   * Dit is de fallback wanneer Supabase Realtime op gsm
   * tijdelijk wordt gepauzeerd of verbroken.
   */
  const syncFromServer = useCallback(async () => {
    if (syncInFlight.current) return;

    syncInFlight.current = true;

    try {
      const res = await fetch(
        `/api/matches/${matchId}/sync?t=${Date.now()}`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            "Cache-Control": "no-cache",
          },
        }
      );

      if (!res.ok) return;

      const json = await res.json();

      if (json.match) {
        setRow(json.match as MatchRow);
      }
    } finally {
      syncInFlight.current = false;
    }
  }, [matchId]);

  /**
   * Supabase Realtime blijft de snelste manier.
   * Wanneer dat faalt, blijft de polling hieronder werken.
   */
  useEffect(() => {
    void syncFromServer();

    const channel = supabase
      .channel(`match:${matchId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "matches",
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          setRow(payload.new as MatchRow);
          setLiveStatus("live");
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setLiveStatus("live");
        }

        if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setLiveStatus("fallback");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, matchId, syncFromServer]);

  /**
   * GSM-browsers pauzeren websocketverbindingen soms
   * wanneer je toestel lockt of naar een andere app gaat.
   *
   * Daarom onmiddellijk resyncen wanneer je terugkomt.
   */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void syncFromServer();
      }
    };

    const onFocus = () => {
      void syncFromServer();
    };

    const onOnline = () => {
      void syncFromServer();
    };

    const onPageShow = () => {
      void syncFromServer();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [syncFromServer]);

  const state = row?.state;

  const myIndex: 0 | 1 | null = row
    ? row.player_a === userId
      ? 0
      : row.player_b === userId
        ? 1
        : null
    : null;

  /**
   * LIVE PVP FALLBACK
   *
   * Iedere seconde halen we de nieuwste match op.
   *
   * Realtime is dus snelste pad,
   * polling is het vangnet.
   */
  useEffect(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
    }

    const isLivePvp =
      !!row &&
      !!state &&
      (row.mode === "pvp" || (!row.mode && !state.isCampaign)) &&
      !state.matchOver;

    if (!isLivePvp) return;

    pollTimer.current = setInterval(() => {
      if (
        !acting &&
        document.visibilityState === "visible"
      ) {
        void syncFromServer();
      }
    }, 1000);

    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
      }
    };
  }, [row, state, acting, syncFromServer]);

  /**
   * Normale spelersactie.
   */
  const act = useCallback(
    async (body: any) => {
      setActing(true);

      try {
        const res = await fetch(
          `/api/matches/${matchId}/action`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(body),
          }
        );

        if (res.ok) {
          const json = await res.json();

          setRow((current) =>
            current
              ? {
                  ...current,
                  state: json.state,
                }
              : current
          );

          /**
           * Meteen volledige match opnieuw ophalen.
           *
           * Daardoor krijgen we niet alleen state,
           * maar ook updated_at, rewards, finalized enz.
           */
          await syncFromServer();
        } else if (res.status === 409) {
          await syncFromServer();
        }
      } finally {
        setActing(false);
      }
    },
    [matchId, syncFromServer]
  );

  /**
   * Achtergrondacties.
   *
   * Zet de normale knoppen niet op busy.
   */
  const silentAct = useCallback(
    async (body: any) => {
      const res = await fetch(
        `/api/matches/${matchId}/action`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        const json = await res.json();

        setRow((current) =>
          current
            ? {
                ...current,
                state: json.state,
              }
            : current
        );

        await syncFromServer();
      } else if (res.status === 409) {
        await syncFromServer();
      }
    },
    [matchId, syncFromServer]
  );

  /**
   * Resultaatschermen sneller maken.
   *
   * Was 2600ms.
   * Nu 1600ms.
   */
  useEffect(() => {
    if (autoTimer.current) {
      clearTimeout(autoTimer.current);
    }

    if (!state) return;

    if (state.phase === "roundResult") {
      autoTimer.current = setTimeout(() => {
        void silentAct({
          type: "ADVANCE",
        });
      }, 1600);
    } else if (state.phase === "roundOver") {
      autoTimer.current = setTimeout(() => {
        void silentAct({
          type: "NEXT_BATTLE",
        });
      }, 1600);
    }

    return () => {
      if (autoTimer.current) {
        clearTimeout(autoTimer.current);
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.round, state?.roundNum]);

  /**
   * Idle opponent.
   *
   * Server beslist zelf of timeout werkelijk bereikt is.
   */
  useEffect(() => {
    if (idleTimer.current) {
      clearInterval(idleTimer.current);
    }

    if (
      !state ||
      state.isCampaign ||
      state.matchOver
    ) {
      return;
    }

    if (
      state.phase !== "betting" &&
      state.phase !== "action"
    ) {
      return;
    }

    idleTimer.current = setInterval(() => {
      void silentAct({
        type: "AUTO_TIMEOUT",
      });
    }, 15000);

    return () => {
      if (idleTimer.current) {
        clearInterval(idleTimer.current);
      }
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state?.phase,
    state?.round,
    state?.roundNum,
    state?.isCampaign,
    state?.matchOver,
  ]);

  /**
   * Als een match net afgelopen is maar reward-finalization
   * niet is afgerond, opnieuw veilig proberen.
   */
  useEffect(() => {
    if (
      !row?.state?.matchOver ||
      row.finalized
    ) {
      return;
    }

    const timer = setTimeout(() => {
      void silentAct({
        type: "FINALIZE",
      });
    }, 3000);

    return () => {
      clearTimeout(timer);
    };
  }, [
    row?.state?.matchOver,
    row?.finalized,
    silentAct,
  ]);

  async function forfeit() {
    setConfirmForfeit(false);

    await act({
      type: "FORFEIT",
    });
  }

  async function rematch() {
    if (
      !row ||
      myIndex === null
    ) {
      return;
    }

    const opponentId =
      myIndex === 0
        ? row.player_b
        : row.player_a;

    if (!opponentId) return;

    setRematchSent(true);

    await fetch(
      "/api/challenges/create",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          opponentId,
        }),
      }
    );
  }

  if (
    !row ||
    !state ||
    myIndex === null
  ) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-dim">
          Laden&hellip;
        </p>
      </main>
    );
  }

  const oppIndex: 0 | 1 =
    myIndex === 0 ? 1 : 0;

  const myNeedsAction =
    needsMyAction(
      state,
      myIndex
    );

  const opponentNeedsAction =
    needsMyAction(
      state,
      oppIndex
    );

  const turnMessage =
    state.matchOver
      ? "MATCH AFGELOPEN"
      : myNeedsAction
        ? "JOUW BEURT"
        : opponentNeedsAction
          ? `WACHT OP ${state.players[
              oppIndex
            ].name.toUpperCase()}`
          : state.phase === "roundResult" ||
              state.phase === "roundOver"
            ? "RESULTAAT VERWERKEN…"
            : "SYNCHRONISEREN…";

  return (
    <main className="min-h-screen px-4 pt-6 pb-10 max-w-lg mx-auto flex flex-col gap-3">

      {/* NAVIGATIE */}

      <div className="flex items-center justify-between mb-2">
        <Link
          href="/dashboard"
          className="btn-ghost !py-2 !px-3 text-xs"
          onClick={(e) => {
            if (
              !state.isCampaign &&
              !state.matchOver
            ) {
              const leave =
                window.confirm(
                  "LET OP: LIVE WEDSTRIJD!\n\n" +
                    "Je verlaat een actieve 1v1. " +
                    "De wedstrijd loopt gewoon verder en je tegenstander hoeft niet op je te wachten.\n\n" +
                    "Wil je toch naar het hoofdmenu?"
                );

              if (!leave) {
                e.preventDefault();
              }
            }
          }}
        >
          ← Hoofdmenu
        </Link>

        <span className="text-dim text-xs">
          {row.mode === "random"
            ? "RANDOM CHALLENGER"
            : state.isCampaign
              ? "CAMPAIGN"
              : "1 VS 1"}

          {row.bot_rating != null &&
            ` · Bot ${row.bot_rating} R`}
        </span>
      </div>

      {/* LIVE STATUS */}

      {!state.isCampaign &&
        !state.matchOver && (
          <div
            className={`panel !py-2.5 flex items-center justify-between gap-3 ${
              myNeedsAction
                ? "border-gold"
                : ""
            }`}
          >
            <span
              className={`font-display text-sm ${
                myNeedsAction
                  ? "text-goldbright"
                  : "text-dim"
              }`}
            >
              {turnMessage}
            </span>

            <span className="text-[10px] text-dim whitespace-nowrap">
              {liveStatus === "live"
                ? "● LIVE"
                : liveStatus === "fallback"
                  ? "↻ AUTO-SYNC"
                  : "… VERBINDEN"}
            </span>
          </div>
        )}

      {/* RONDE INFO */}

      <div className="flex items-center justify-between font-display text-sm text-dim tracking-wide">
        <span>
          Ronde {state.roundNum} / 3
          {" · "}
          {"\u{1F3C6}"}{" "}
          {state.roundsWon[0]}
          &ndash;
          {state.roundsWon[1]}
        </span>

        <span>
          {phaseLabel(
            state.phase
          )}
        </span>
      </div>

      {/* SPELERS */}

      {[myIndex, oppIndex].map(
        (index) => (
          <PlayerPanel
            key={index}
            state={state}
            index={index}
            isMe={
              index === myIndex
            }
            onAct={act}
            busy={acting}
          />
        )
      )}

      {/* ROUND RESULT */}

      {state.phase ===
        "roundResult" &&
        state.lastResult && (
          <RoundBanner
            state={state}
          />
        )}

      {/* ROUND OVER */}

      {state.phase ===
        "roundOver" &&
        state.lastResult && (
          <Overlay
            title="K.O."
            titleClass="text-teal"
            subtitle={`${
              state.players[
                state.lastResult
                  .battleWinnerIndex ??
                  0
              ].name
            } wint ronde ${
              state.roundNum
            }!`}
            extra={`Rondestand: ${state.roundsWon[0]}–${state.roundsWon[1]} · nieuwe ronde start zo…`}
          />
        )}

      {/* FINISHER */}

      {state.phase ===
        "finisher" && (
          <Overlay
            title="K.O."
            titleClass="text-goldbright"
            subtitle={
              state.winnerIndex ===
              -1
                ? "Gelijkspel"
                : `${
                    state.players[
                      state
                        .winnerIndex!
                    ].name
                  } wint de match! (${state.roundsWon[0]}–${state.roundsWon[1]})`
            }
          />
        )}

      {/* MATCH AFGELOPEN */}

      {state.matchOver && (
        <div className="panel flex flex-col gap-3 items-center text-center">

          <h2 className="font-display text-2xl text-goldbright">
            Match afgelopen
          </h2>

          <p className="text-dim text-sm">
            {state.winnerIndex ===
            -1
              ? "Gelijkspel"
              : state.winnerIndex ===
                  myIndex
                ? "Je hebt gewonnen!"
                : "Je hebt verloren."}

            {" · "}

            {state.roundsWon[0]}
            &ndash;
            {state.roundsWon[1]}
          </p>

          {row.finalized &&
            (myIndex === 0
              ? row.rewards?.a
              : row.rewards?.b) && (
              <div className="bg-bgalt rounded-lg p-3 w-full flex justify-center gap-4 font-bold text-sm flex-wrap">

                <span className="text-goldbright">
                  🪙 +
                  {(myIndex === 0
                    ? row.rewards?.a
                    : row.rewards?.b
                  )?.tokens || 0}{" "}
                  tokens
                </span>

                <span className="text-teal">
                  {((myIndex ===
                  0
                    ? row.rewards?.a
                    : row.rewards?.b
                  )?.rating ||
                    0) >= 0
                    ? "+"
                    : ""}

                  {(myIndex === 0
                    ? row.rewards?.a
                    : row.rewards?.b
                  )?.rating || 0}{" "}
                  rating
                </span>

                {((myIndex === 0
                  ? row.rewards?.a
                  : row.rewards?.b
                )?.bounty ||
                  0) > 0 && (
                  <span>
                    🎯 BOUNTY
                    +10
                  </span>
                )}
              </div>
            )}

          <div className="flex gap-2 w-full">

            <Link
              href={
                row.mode ===
                "random"
                  ? "/challenger"
                  : state.isCampaign
                    ? "/campaign"
                    : "/friends"
              }
              className="btn-ghost flex-1 text-center"
            >
              {row.mode ===
              "random"
                ? "Challenger"
                : state.isCampaign
                  ? "Ladder"
                  : "Vrienden"}
            </Link>

            <Link
              href="/dashboard"
              className="btn-primary flex-1 text-center"
            >
              Hoofdmenu
            </Link>
          </div>

          {!state.isCampaign && (
            <button
              className="btn-ghost w-full"
              disabled={
                rematchSent
              }
              onClick={
                rematch
              }
            >
              {rematchSent
                ? "Rematch-uitdaging verstuurd ✓"
                : "Vraag rematch"}
            </button>
          )}
        </div>
      )}

      {/* FORFEIT */}

      {!state.matchOver && (
        <div className="flex justify-center">

          {confirmForfeit ? (
            <div className="panel !py-2.5 flex items-center gap-3 text-sm">

              <span>
                Match opgeven?
                Dit telt als
                verlies.
              </span>

              <button
                className="text-red font-bold"
                onClick={
                  forfeit
                }
              >
                Ja, opgeven
              </button>

              <button
                className="text-dim"
                onClick={() =>
                  setConfirmForfeit(
                    false
                  )
                }
              >
                Annuleer
              </button>

            </div>
          ) : (
            <button
              className="text-dim text-xs underline"
              onClick={() =>
                setConfirmForfeit(
                  true
                )
              }
            >
              Match opgeven
            </button>
          )}
        </div>
      )}

      {/* CHAT */}

      {!state.isCampaign && (
        <ChatPanel
          matchId={matchId}
          userId={userId}
          opponentName={
            state.players[
              oppIndex
            ].name
          }
        />
      )}
    </main>
  );
}

function needsMyAction(
  state: MatchState,
  index: 0 | 1
) {
  if (state.matchOver) {
    return false;
  }

  if (
    state.phase ===
    "betting"
  ) {
    return (
      state.pendingBets[
        index
      ] == null
    );
  }

  if (
    state.phase ===
    "action"
  ) {
    const hands =
      state.hands?.[
        index
      ] || [];

    return hands.some(
      (
        hand,
        handIndex
      ) =>
        !hand.done &&
        state.pending[
          index
        ][handIndex] ==
          null
    );
  }

  return false;
}

function phaseLabel(
  phase: MatchState["phase"]
) {
  if (
    phase === "betting"
  ) {
    return "Plaats je inzet";
  }

  if (
    phase === "action"
  ) {
    return "Kies HIT of STAND";
  }

  if (
    phase === "roundOver"
  ) {
    return "Ronde beslist!";
  }

  if (
    phase === "finisher"
  ) {
    return "Genadeklap!";
  }

  return "";
}

function Overlay({
  title,
  titleClass,
  subtitle,
  extra,
}: {
  title: string;
  titleClass: string;
  subtitle: string;
  extra?: string;
}) {
  return (
    <div className="panel flex flex-col items-center justify-center text-center gap-1 py-8 border-gold">

      <div
        className={`font-display text-5xl ${titleClass}`}
      >
        {title}
      </div>

      <div className="font-display text-lg">
        {subtitle}
      </div>

      {extra && (
        <div className="text-dim text-xs mt-1">
          {extra}
        </div>
      )}
    </div>
  );
}

function RoundBanner({
  state,
}: {
  state: MatchState;
}) {
  const r =
    state.lastResult!;

  return (
    <div className="panel !py-3 flex flex-col gap-1 text-sm">

      {r.splitA ||
      r.splitB ? (
        <div className="text-dim text-xs">

          {r.splitA
            ? `${state.players[0].name} splitste. `
            : ""}

          {r.splitB
            ? `${state.players[1].name} splitste.`
            : ""}
        </div>
      ) : null}

      {r.pairs.map(
        (pr, idx) => (
          <div key={idx}>

            {r.pairs
              .length >
              1 && (
              <span className="text-dim font-bold">
                Duel{" "}
                {idx + 1}
                :{" "}
              </span>
            )}

            {pr.outcome ===
              "push" && (
              <span>
                Gelijk spel
                &mdash; geen
                schade.
              </span>
            )}

            {pr.outcome ===
              "mutualBust" && (
              <span>
                Beide bust!
                Botsing
                &mdash;
                wederzijdse
                schade.
              </span>
            )}

            {pr.outcome ===
              "aWins" && (
              <span>
                {
                  state
                    .players[0]
                    .name
                }{" "}
                wint &mdash;{" "}
                {pr.dmgToB}{" "}
                schade
                {pr.aBJ
                  ? " (BLACKJACK!)"
                  : ""}
                {pr.doubledA
                  ? " (DOUBLE)"
                  : ""}
              </span>
            )}

            {pr.outcome ===
              "bWins" && (
              <span>
                {
                  state
                    .players[1]
                    .name
                }{" "}
                wint &mdash;{" "}
                {pr.dmgToA}{" "}
                schade
                {pr.bBJ
                  ? " (BLACKJACK!)"
                  : ""}
                {pr.doubledB
                  ? " (DOUBLE)"
                  : ""}
              </span>
            )}
          </div>
        )
      )}

      {(r.comebackA ||
        r.comebackB) && (
        <div className="text-dim text-xs">

          {r.comebackA
            ? `${state.players[0].name} 🔥 `
            : ""}

          {r.comebackB
            ? `${state.players[1].name} 🔥`
            : ""}
        </div>
      )}

      {(r.ironWillA ||
        r.ironWillB) && (
        <div className="text-goldbright text-xs font-bold">

          🛡{" "}

          {r.ironWillA
            ? state
                .players[0]
                .name
            : state
                .players[1]
                .name}{" "}

          overleeft dankzij
          IJzeren Wil met 1
          HP!
        </div>
      )}
    </div>
  );
}

function PlayerPanel({
  state,
  index,
  isMe,
  onAct,
  busy,
}: {
  state: MatchState;
  index: 0 | 1;
  isMe: boolean;
  onAct: (
    body: any
  ) => void;
  busy: boolean;
}) {
  const p =
    state.players[index];

  const subhands =
    state.hands?.[
      index
    ] || null;

  const needsBet =
    isMe &&
    state.phase ===
      "betting" &&
    state.pendingBets[
      index
    ] == null;

  const cardsHidden =
    state.phase ===
      "action" ||
    state.phase ===
      "betting";

  const playerDone =
    state.phase ===
      "action" &&
    subhands?.every(
      (
        sh,
        shIdx
      ) =>
        sh.done ||
        state.pending[
          index
        ][shIdx] !=
          null
    );

 const classDef =
  p.classId
    ? CLASS_DEFS[p.classId]
    : undefined;

  const hpPercent =
    Math.max(
      0,
      Math.min(
        100,
        (p.hp /
          p.maxHp) *
          100
      )
    );

  return (
    <div
      className={`panel flex flex-col gap-3 ${
        isMe
          ? "border-gold/40"
          : ""
      }`}
    >

      <div className="flex justify-between items-start gap-3">

        <div>

          <div className="flex gap-2 items-center flex-wrap">

            <span className="font-display text-lg">
              {p.name}
            </span>

            {isMe && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gold/20 text-goldbright">
                JIJ
              </span>
            )}

            <span className="text-[10px] text-dim">
              {
                classDef
                  ?.label
              }
            </span>
          </div>

          <div className="text-[10px] text-dim mt-0.5">
            ATK {p.atk}
            {" · "}
            DEF {p.def}

            {p.hp <=
              UNDERDOG_HP && (
              <>
                {" · "}🔥
                COMEBACK
              </>
            )}
          </div>

        </div>

        <div className="text-right">

          <div className="font-display">
            {p.hp}
            /
            {p.maxHp} HP
          </div>

          <div className="text-[10px] text-dim">
            🪙{" "}
            {p.chips}
          </div>
        </div>
      </div>

      <div className="hp-track relative">

        <div
          className={`hp-fill ${
            p.hp /
              p.maxHp >
            0.5
              ? "bg-[#4C8C5B]"
              : p.hp /
                    p.maxHp >
                  0.2
                ? "bg-[#C79A3D]"
                : "bg-[#B33B3B]"
          }`}
          style={{
            width: `${hpPercent}%`,
          }}
        />

        <span
          className="absolute inset-0 flex items-center justify-center text-[10px] font-bold"
          style={{
            textShadow:
              "0 1px 2px rgba(0,0,0,.6)",
          }}
        >
          {p.hp}
          /
          {p.maxHp}
        </span>
      </div>

      {subhands ? (
        <div className="flex flex-col gap-2.5">

          {subhands.map(
            (
              sh,
              shIdx
            ) => {
              const val =
                computeHandValue(
                  sh.cards
                );

              const active =
                !sh.done;

              const chosen =
                state.pending[
                  index
                ][shIdx] !=
                null;

              const showControls =
                isMe &&
                state.phase ===
                  "action" &&
                active &&
                !chosen;

              const canDoubleThis =
                showControls &&
                sh.cards
                  .length ===
                  2;

              const canSplitThis =
                showControls &&
                subhands
                  .length ===
                  1 &&
                canSplitCards(
                  sh.cards
                );

              const concealed =
                sh.doubled &&
                cardsHidden;

              return (
                <div
                  key={
                    shIdx
                  }
                  className="flex flex-col gap-2"
                >

                  <div className="flex items-center gap-2 flex-wrap min-h-[58px]">

                    {subhands.length ===
                      2 && (
                      <span className="text-[10px] text-dim uppercase">
                        Hand{" "}
                        {shIdx +
                          1}
                      </span>
                    )}

                    {sh.doubled && (
                      <span className="text-[11px] text-goldbright font-bold">
                        ×2
                      </span>
                    )}

                    {sh.cards.map(
                      (
                        c,
                        cardIndex
                      ) => {
                        const hidden =
                          sh.doubled &&
                          cardIndex ===
                            sh
                              .cards
                              .length -
                              1 &&
                          cardsHidden;

                        return (
                          <div
                            key={
                              cardIndex
                            }
                            className="card-face"
                          >

                            {hidden ? (
                              <div
                                className="w-full h-full rounded-md"
                                style={{
                                  background:
                                    "repeating-linear-gradient(45deg,#3E8E7E,#3E8E7E 4px,#2f6e60 4px,#2f6e60 8px)",
                                }}
                              />
                            ) : (
                              <>
                                <span
                                  className={`font-display text-base ${
                                    c.color ===
                                    "red"
                                      ? "text-red"
                                      : "text-ink"
                                  }`}
                                >
                                  {
                                    c.rank
                                  }
                                </span>

                                <span
                                  className={`text-base ${
                                    c.color ===
                                    "red"
                                      ? "text-red"
                                      : "text-ink"
                                  }`}
                                >
                                  {
                                    c.suit
                                  }
                                </span>
                              </>
                            )}
                          </div>
                        );
                      }
                    )}

                    <div className="ml-auto">

                      {concealed ? (
                        <span className="font-display text-2xl text-dim">
                          ?
                        </span>
                      ) : sh.busted ? (
                        <span className="text-xs font-bold px-2 py-1 rounded-md bg-[#B33B3B33] text-[#E58A82]">
                          BUST (
                          {
                            val.total
                          }
                          )
                        </span>
                      ) : isNaturalBlackjack(
                          sh.cards
                        ) ? (
                        <span className="text-xs font-bold px-2 py-1 rounded-md bg-gold/20 text-goldbright">
                          BLACKJACK!
                        </span>
                      ) : (
                        <span className="font-display text-2xl">
                          {
                            val.total
                          }
                        </span>
                      )}
                    </div>
                  </div>

                  {showControls && (
                    <div className="flex gap-2 flex-wrap">

                      <button
                        className="btn-hit"
                        disabled={
                          busy
                        }
                        onClick={() =>
                          onAct({
                            type: "CHOOSE",
                            subIndex:
                              shIdx,
                            choice:
                              "hit",
                          })
                        }
                      >
                        HIT
                      </button>

                      <button
                        className="btn-stand"
                        disabled={
                          busy
                        }
                        onClick={() =>
                          onAct({
                            type: "CHOOSE",
                            subIndex:
                              shIdx,
                            choice:
                              "stand",
                          })
                        }
                      >
                        STAND
                      </button>

                      {canDoubleThis && (
                        <button
                          className="btn-double"
                          disabled={
                            busy
                          }
                          onClick={() =>
                            onAct({
                              type: "CHOOSE",
                              subIndex:
                                shIdx,
                              choice:
                                "double",
                            })
                          }
                        >
                          DOUBLE
                        </button>
                      )}

                      {canSplitThis && (
                        <button
                          className="btn-split"
                          disabled={
                            busy
                          }
                          onClick={() =>
                            onAct({
                              type: "CHOOSE",
                              subIndex:
                                shIdx,
                              choice:
                                "split",
                            })
                          }
                        >
                          SPLIT
                        </button>
                      )}
                    </div>
                  )}

                  {isMe &&
                    state.phase ===
                      "action" &&
                    active &&
                    chosen && (
                      <div className="text-xs text-dim italic">
                        ✓ Gekozen,
                        wachten&hellip;
                      </div>
                    )}
                </div>
              );
            }
          )}

          {isMe &&
            state.phase ===
              "action" &&
            playerDone && (
              <div className="text-xs text-dim italic">
                Klaar
              </div>
            )}
        </div>
      ) : (
        <div className="min-h-[58px] flex items-center justify-center text-dim text-sm">
          Wacht op
          inzet&hellip;
        </div>
      )}

      {needsBet && (
        <div className="flex flex-col items-center gap-2 mt-2">

          {p.chips >
            0 && (
            <div className="flex gap-1.5 flex-wrap justify-center">

              {Array.from({
                length:
                  p.chips,
              }).map(
                (
                  _,
                  idx
                ) => (
                  <button
                    key={
                      idx
                    }
                    title={`Zet in: deze chip ben je hoe dan ook kwijt, maar je doet ${p.wagerMultiplier}x schade als je deze hand wint.`}
                    className="w-9 h-9 rounded-full bg-gradient-to-b from-goldbright to-gold text-[#241804] text-lg"
                    disabled={
                      busy
                    }
                    onClick={() =>
                      onAct(
                        {
                          type: "BET",
                          amount:
                            1,
                        }
                      )
                    }
                  >
                    🪙
                  </button>
                )
              )}
            </div>
          )}

          <button
            className="text-dim text-xs underline"
            disabled={busy}
            onClick={() =>
              onAct({
                type: "BET",
                amount: 0,
              })
            }
          >
            Geen inzet
          </button>
        </div>
      )}

      {isMe &&
        state.phase ===
          "betting" &&
        !needsBet && (
          <div className="text-xs text-dim italic mt-1">
            ✓ Ingezet
          </div>
        )}
    </div>
  );
}
