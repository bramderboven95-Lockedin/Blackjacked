"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { MatchState, SubHand } from "@/lib/game/reducer";
import { CLASS_DEFS, canSplitCards, computeHandValue, isNaturalBlackjack, UNDERDOG_HP } from "@/lib/game/engine";
import ChatPanel from "@/components/ChatPanel";

type MatchRow = {
  id: string;
  player_a: string;
  player_b: string | null;
  is_campaign: boolean;
  state: MatchState;
  finalized: boolean;
  updated_at: string;
};

export default function GameBoard({ matchId, userId }: { matchId: string; userId: string }) {
  const supabase = createClient();
  const [row, setRow] = useState<MatchRow | null>(null);
  const [acting, setActing] = useState(false);
  const [confirmForfeit, setConfirmForfeit] = useState(false);
  const [rematchSent, setRematchSent] = useState(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("matches").select("*").eq("id", matchId).single();
    if (data) setRow(data as MatchRow);
  }, [supabase, matchId]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel(`match:${matchId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` }, (payload) => {
        setRow(payload.new as MatchRow);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, matchId, load]);

  const state = row?.state;
  const myIndex: 0 | 1 | null = row ? (row.player_a === userId ? 0 : row.player_b === userId ? 1 : null) : null;

  const act = useCallback(
    async (body: any) => {
      setActing(true);
      try {
        const res = await fetch(`/api/matches/${matchId}/action`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const json = await res.json();
          setRow((r) => (r ? { ...r, state: json.state } : r));
        }
      } finally {
        setActing(false);
      }
    },
    [matchId]
  );

  // Silent version for background pings (auto-continue, idle timeout) —
  // never toggles the "busy" UI state, so it can't accidentally freeze the
  // buttons for the player who's actively deciding something.
  const silentAct = useCallback(
    async (body: any) => {
      const res = await fetch(`/api/matches/${matchId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const json = await res.json();
        setRow((r) => (r ? { ...r, state: json.state } : r));
      }
    },
    [matchId]
  );

  // Auto-continue after a round result / round-over banner, same pacing as
  // the original local game. Either player's client firing this is fine —
  // the server guards ADVANCE/NEXT_BATTLE against being applied twice.
  useEffect(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    if (!state) return;
    if (state.phase === "roundResult") {
      autoTimer.current = setTimeout(() => silentAct({ type: "ADVANCE" }), 2600);
    } else if (state.phase === "roundOver") {
      autoTimer.current = setTimeout(() => silentAct({ type: "NEXT_BATTLE" }), 2600);
    }
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.round, state?.roundNum]);

  // If a human opponent goes idle mid-decision, periodically ping the server
  // to check whether enough real time has passed to auto-apply a safe
  // default on their behalf — so a match can never get stuck forever because
  // someone closed the tab. The server itself decides if it's actually been
  // long enough; this is just a low-frequency check-in.
  useEffect(() => {
    if (idleTimer.current) clearInterval(idleTimer.current);
    if (!state || state.isCampaign || state.matchOver) return;
    if (state.phase !== "betting" && state.phase !== "action") return;
    idleTimer.current = setInterval(() => silentAct({ type: "AUTO_TIMEOUT" }), 15000);
    return () => {
      if (idleTimer.current) clearInterval(idleTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.phase, state?.round, state?.roundNum, state?.isCampaign, state?.matchOver]);

  async function forfeit() {
    setConfirmForfeit(false);
    await act({ type: "FORFEIT" });
  }

  async function rematch() {
    if (!row || myIndex === null) return;
    const opponentId = myIndex === 0 ? row.player_b : row.player_a;
    if (!opponentId) return;
    setRematchSent(true);
    await fetch("/api/challenges/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opponentId }),
    });
  }

  if (!row || !state || myIndex === null) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-dim">Laden&hellip;</p>
      </main>
    );
  }

  const oppIndex: 0 | 1 = myIndex === 0 ? 1 : 0;

  return (
    <main className="min-h-screen px-4 pt-6 pb-10 max-w-lg mx-auto flex flex-col gap-3">
      
{/* NAVIGATIE TIJDENS DE WEDSTRIJD */}

<div className="flex items-center justify-between mb-2">
  <Link
    href="/dashboard"
    className="btn-ghost !py-2 !px-3 text-xs"
    onClick={(e) => {
      if (!state.isCampaign && !state.matchOver) {
        const leave = window.confirm(
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
    {state.isCampaign ? "CAMPAIGN" : "1 VS 1"}
  </span>
</div>

      <div className="flex items-center justify-between font-display text-sm text-dim tracking-wide">
        <span>
          Ronde {state.roundNum} / 3 &middot; {"\u{1F3C6}"} {state.roundsWon[0]}&ndash;{state.roundsWon[1]}
        </span>
        <span>{phaseLabel(state.phase)}</span>
      </div>

      {[myIndex, oppIndex].map((i) => (
        <PlayerPanel key={i} state={state} index={i} isMe={i === myIndex} onAct={act} busy={acting} />
      ))}

      {state.phase === "roundResult" && state.lastResult && <RoundBanner state={state} />}

      {state.phase === "roundOver" && state.lastResult && (
        <Overlay
          title="K.O."
          titleClass="text-teal"
          subtitle={`${state.players[state.lastResult.battleWinnerIndex ?? 0].name} wint ronde ${state.roundNum}!`}
          extra={`Rondestand: ${state.roundsWon[0]}\u2013${state.roundsWon[1]} \u00b7 nieuwe ronde start zo\u2026`}
        />
      )}

      {state.phase === "finisher" && (
        <Overlay
          title="K.O."
          titleClass="text-goldbright"
          subtitle={
            state.winnerIndex === -1
              ? "Gelijkspel"
              : `${state.players[state.winnerIndex!].name} wint de match! (${state.roundsWon[0]}\u2013${state.roundsWon[1]})`
          }
        />
      )}

      {state.matchOver && (
        <div className="panel flex flex-col gap-3 items-center text-center">
          <h2 className="font-display text-2xl text-goldbright">Match afgelopen</h2>
          <p className="text-dim text-sm">
            {state.winnerIndex === -1
              ? "Gelijkspel"
              : state.winnerIndex === myIndex
              ? "Je hebt gewonnen!"
              : "Je hebt verloren."}{" "}
            &middot; {state.roundsWon[0]}&ndash;{state.roundsWon[1]}
          </p>
          <div className="flex gap-2 w-full">
            <Link href={state.isCampaign ? "/campaign" : "/friends"} className="btn-ghost flex-1 text-center">
              {state.isCampaign ? "Ladder" : "Vrienden"}
            </Link>
            <Link href="/dashboard" className="btn-primary flex-1 text-center">
              Hoofdmenu
            </Link>
          </div>
          {!state.isCampaign && (
            <button className="btn-ghost w-full" disabled={rematchSent} onClick={rematch}>
              {rematchSent ? "Rematch-uitdaging verstuurd \u2713" : "Vraag rematch"}
            </button>
          )}
        </div>
      )}

      {!state.matchOver && (
        <div className="flex justify-center">
          {confirmForfeit ? (
            <div className="panel !py-2.5 flex items-center gap-3 text-sm">
              <span>Match opgeven? Dit telt als verlies.</span>
              <button className="text-red font-bold" onClick={forfeit}>
                Ja, opgeven
              </button>
              <button className="text-dim" onClick={() => setConfirmForfeit(false)}>
                Annuleer
              </button>
            </div>
          ) : (
            <button className="text-dim text-xs underline" onClick={() => setConfirmForfeit(true)}>
              Match opgeven
            </button>
          )}
        </div>
      )}

      {!state.isCampaign && (
        <ChatPanel matchId={matchId} userId={userId} opponentName={state.players[oppIndex].name} />
      )}
    </main>
  );
}

function phaseLabel(phase: MatchState["phase"]) {
  if (phase === "betting") return "Plaats je inzet";
  if (phase === "action") return "Kies HIT of STAND";
  if (phase === "roundOver") return "Ronde beslist!";
  if (phase === "finisher") return "Genadeklap!";
  return "";
}

function Overlay({ title, titleClass, subtitle, extra }: { title: string; titleClass: string; subtitle: string; extra?: string }) {
  return (
    <div className="panel flex flex-col items-center justify-center text-center gap-1 py-8 border-gold">
      <div className={`font-display text-5xl ${titleClass}`}>{title}</div>
      <div className="font-display text-lg">{subtitle}</div>
      {extra && <div className="text-dim text-xs mt-1">{extra}</div>}
    </div>
  );
}

function RoundBanner({ state }: { state: MatchState }) {
  const r = state.lastResult!;
  return (
    <div className="panel !py-3 flex flex-col gap-1 text-sm">
      {r.splitA || r.splitB ? (
        <div className="text-dim text-xs">
          {r.splitA ? `${state.players[0].name} splitste. ` : ""}
          {r.splitB ? `${state.players[1].name} splitste.` : ""}
        </div>
      ) : null}
      {r.pairs.map((pr, idx) => (
        <div key={idx}>
          {r.pairs.length > 1 && <span className="text-dim font-bold">Duel {idx + 1}: </span>}
          {pr.outcome === "push" && <span>Gelijk spel &mdash; geen schade.</span>}
          {pr.outcome === "mutualBust" && <span>Beide bust! Botsing &mdash; wederzijdse schade.</span>}
          {pr.outcome === "aWins" && (
            <span>
              {state.players[0].name} wint &mdash; {pr.dmgToB} schade
              {pr.aBJ ? " (BLACKJACK!)" : ""}
              {pr.doubledA ? " (DOUBLE)" : ""}
            </span>
          )}
          {pr.outcome === "bWins" && (
            <span>
              {state.players[1].name} wint &mdash; {pr.dmgToA} schade
              {pr.bBJ ? " (BLACKJACK!)" : ""}
              {pr.doubledB ? " (DOUBLE)" : ""}
            </span>
          )}
        </div>
      ))}
      {(r.comebackA || r.comebackB) && (
        <div className="text-dim text-xs">
          {r.comebackA ? `${state.players[0].name} \u{1F525} ` : ""}
          {r.comebackB ? `${state.players[1].name} \u{1F525}` : ""}
        </div>
      )}
      {(r.ironWillA || r.ironWillB) && (
        <div className="text-goldbright text-xs font-bold">
          {"\u{1F6E1}"} {r.ironWillA ? state.players[0].name : state.players[1].name} overleeft dankzij IJzeren Wil met 1 HP!
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
  onAct: (body: any) => void;
  busy: boolean;
}) {
  const p = state.players[index];
  const subhands = state.hands ? state.hands[index] : null;
  const comeback = p.hp > 0 && p.hp <= (p.comebackThreshold || UNDERDOG_HP);
  const cardsHidden = state.phase === "action" || state.phase === "readyToResolve";
  const playerDone = subhands ? subhands.every((h) => h.done) : false;

  const needsBet = isMe && state.phase === "betting" && state.pendingBets[index] == null;
  const anyOpenNeedsChoice =
    isMe && state.phase === "action" && subhands && subhands.some((h, s) => !h.done && state.pending[index][s] == null);

  return (
    <div className={`panel !p-3.5 ${needsBet || anyOpenNeedsChoice ? "border-gold shadow-[0_0_16px_rgba(212,160,57,.2)]" : ""}`}>
      <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold">
            {p.name} {isMe && <span className="text-dim text-xs">(jij)</span>}
          </span>
          {p.classId && CLASS_DEFS[p.classId] && (
            <span className="text-[10px] text-teal border border-teal rounded-full px-1.5">{CLASS_DEFS[p.classId].label}</span>
          )}
          {p.isBot && <span className="text-[10px] text-[#8B7FD1] border border-[#8B7FD1] rounded-full px-1.5">{"\u{1F916}"} Bot</span>}
          {state.bets && <span className="text-[11px] bg-gold/15 text-goldbright border border-gold/35 rounded-full px-2 font-bold">x{state.bets[index]}</span>}
        </div>
        <div className="flex gap-1.5 items-center text-xs">
          <span className={`bg-bgalt border border-line rounded-full px-2 py-0.5 ${comeback ? "border-gold text-goldbright" : "text-dim"}`}>
            ATK <b className="text-text">{p.atk + (comeback ? 3 : 0)}</b>
          </span>
          <span className={`bg-bgalt border border-line rounded-full px-2 py-0.5 ${comeback ? "border-gold text-goldbright" : "text-dim"}`}>
            DEF <b className="text-text">{p.def + (comeback ? 2 : 0)}</b>
          </span>
          <span className="bg-bgalt border border-line rounded-full px-2 py-0.5 text-dim">
            {"\u{1FA99}"} <b className="text-text">{p.chips}</b>
          </span>
        </div>
      </div>
      {p.perks.length > 0 && <div className="text-[10px] text-dim mb-1">{p.perks.join(" \u00b7 ")}</div>}
      {comeback && <div className="text-[11px] text-[#E0883A] font-bold mb-1.5">{"\u{1F525}"} Comeback bonus actief</div>}

      <div className="hp-track mb-2.5">
        <div
          className={`hp-fill ${p.hp / p.maxHp > 0.5 ? "bg-[#4C8C5B]" : p.hp / p.maxHp > 0.2 ? "bg-[#C79A3D]" : "bg-[#B33B3B]"}`}
          style={{ width: `${Math.max(0, Math.min(100, (p.hp / p.maxHp) * 100))}%` }}
        />
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold" style={{ textShadow: "0 1px 2px rgba(0,0,0,.6)" }}>
          {p.hp}/{p.maxHp} HP
        </span>
      </div>

      {subhands ? (
        <div className="flex flex-col gap-2.5">
          {subhands.map((sh, shIdx) => {
            const val = computeHandValue(sh.cards);
            const active = !sh.done;
            const chosen = state.pending[index][shIdx] != null;
            const showControls = isMe && state.phase === "action" && active && !chosen;
            const canDoubleThis = showControls && sh.cards.length === 2;
            const canSplitThis = showControls && subhands.length === 1 && canSplitCards(sh.cards);
            const concealed = sh.doubled && cardsHidden;
            return (
              <div key={shIdx} className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap min-h-[58px]">
                  {subhands.length === 2 && <span className="text-[10px] text-dim uppercase">Hand {shIdx + 1}</span>}
                  {sh.doubled && <span className="text-[11px] text-goldbright font-bold">{"\u00d7"}2</span>}
                  {sh.cards.map((c, idx) => {
                    const hidden = sh.doubled && idx === sh.cards.length - 1 && cardsHidden;
                    return (
                      <div key={idx} className="card-face">
                        {hidden ? (
                          <div
                            className="w-full h-full rounded-md"
                            style={{
                              background: "repeating-linear-gradient(45deg,#3E8E7E,#3E8E7E 4px,#2f6e60 4px,#2f6e60 8px)",
                            }}
                          />
                        ) : (
                          <>
                            <span className={`font-display text-base ${c.color === "red" ? "text-red" : "text-ink"}`}>{c.rank}</span>
                            <span className={`text-base ${c.color === "red" ? "text-red" : "text-ink"}`}>{c.suit}</span>
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div className="ml-auto">
                    {concealed ? (
                      <span className="font-display text-2xl text-dim">?</span>
                    ) : sh.busted ? (
                      <span className="text-xs font-bold px-2 py-1 rounded-md bg-[#B33B3B33] text-[#E58A82]">BUST ({val.total})</span>
                    ) : isNaturalBlackjack(sh.cards) ? (
                      <span className="text-xs font-bold px-2 py-1 rounded-md bg-gold/20 text-goldbright">BLACKJACK!</span>
                    ) : (
                      <span className="font-display text-2xl">{val.total}</span>
                    )}
                  </div>
                </div>
                {showControls && (
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn-hit" disabled={busy} onClick={() => onAct({ type: "CHOOSE", subIndex: shIdx, choice: "hit" })}>
                      HIT
                    </button>
                    <button className="btn-stand" disabled={busy} onClick={() => onAct({ type: "CHOOSE", subIndex: shIdx, choice: "stand" })}>
                      STAND
                    </button>
                    {canDoubleThis && (
                      <button className="btn-double" disabled={busy} onClick={() => onAct({ type: "CHOOSE", subIndex: shIdx, choice: "double" })}>
                        DOUBLE
                      </button>
                    )}
                    {canSplitThis && (
                      <button className="btn-split" disabled={busy} onClick={() => onAct({ type: "CHOOSE", subIndex: shIdx, choice: "split" })}>
                        SPLIT
                      </button>
                    )}
                  </div>
                )}
                {isMe && state.phase === "action" && active && chosen && (
                  <div className="text-xs text-dim italic">{"\u2713"} Gekozen, wachten&hellip;</div>
                )}
              </div>
            );
          })}
          {isMe && state.phase === "action" && playerDone && <div className="text-xs text-dim italic">Klaar</div>}
        </div>
      ) : (
        <div className="min-h-[58px] flex items-center justify-center text-dim text-sm">Wacht op inzet&hellip;</div>
      )}

      {needsBet && (
        <div className="flex flex-col items-center gap-2 mt-2">
          {p.chips > 0 && (
            <div className="flex gap-1.5 flex-wrap justify-center">
              {Array.from({ length: p.chips }).map((_, idx) => (
                <button
                  key={idx}
                  title={`Zet in: deze chip ben je hoe dan ook kwijt, maar je doet ${p.wagerMultiplier}x schade als je deze hand wint.`}
                  className="w-9 h-9 rounded-full bg-gradient-to-b from-goldbright to-gold text-[#241804] text-lg"
                  disabled={busy}
                  onClick={() => onAct({ type: "BET", amount: 1 })}
                >
                  {"\u{1FA99}"}
                </button>
              ))}
            </div>
          )}
          <button className="text-dim text-xs underline" disabled={busy} onClick={() => onAct({ type: "BET", amount: 0 })}>
            Geen inzet
          </button>
        </div>
      )}
      {isMe && state.phase === "betting" && !needsBet && <div className="text-xs text-dim italic mt-1">{"\u2713"} Ingezet</div>}
    </div>
  );
}
