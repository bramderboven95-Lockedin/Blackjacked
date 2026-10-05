import { NextResponse } from "next/server";

import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  matchReducer,
  settle,
  playBotTurns,
  MatchState,
} from "@/lib/game/reducer";

import { finalizeMatch } from "@/lib/game/finalize";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { user } = await requireUser();

  const body = await request
    .json()
    .catch(() => ({}));

  const admin = createAdminClient();

  /**
   * Altijd de meest recente matchstate ophalen
   * vóór we een actie uitvoeren.
   */
  const { data: match, error: matchError } =
    await admin
      .from("matches")
      .select(
        `
          id,
          player_a,
          player_b,
          is_campaign,
          mode,
          state,
          finalized,
          updated_at
        `
      )
      .eq("id", params.id)
      .single();

  if (matchError || !match) {
    return NextResponse.json(
      {
        error: "Match niet gevonden.",
      },
      {
        status: 404,
      }
    );
  }

  /**
   * Indien finalization al klaar is,
   * niets meer wijzigen.
   */
  if (match.finalized) {
    return NextResponse.json(
      {
        ok: true,
        state: match.state,
        finalized: true,
      }
    );
  }

  /**
   * Server bepaalt altijd zelf wie de speler is.
   */
  let myIndex: 0 | 1;

  if (match.player_a === user.id) {
    myIndex = 0;
  } else if (match.player_b === user.id) {
    myIndex = 1;
  } else {
    return NextResponse.json(
      {
        error:
          "Je speelt niet mee in deze match.",
      },
      {
        status: 403,
      }
    );
  }

  let state =
    match.state as MatchState;

  /**
   * Match kan al afgelopen zijn terwijl
   * rewards nog niet gefinalized zijn.
   *
   * Finalization is idempotent en dus
   * veilig opnieuw uitvoerbaar.
   */
  if (state.matchOver) {
    try {
      await finalizeMatch(
        params.id
      );

      return NextResponse.json({
        ok: true,
        state,
        finalized: true,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "Finalization mislukt.",
        },
        {
          status: 500,
        }
      );
    }
  }

  /**
   * Pas precies één actie toe op de
   * meest recente state.
   */
  switch (body.type) {
    case "BET": {
      state = matchReducer(
        state,
        {
          type: "BET",
          player: myIndex,
          amount:
            body.amount === 1
              ? 1
              : 0,
        }
      );

      break;
    }

    case "CHOOSE": {
      const choice = (
        [
          "hit",
          "stand",
          "double",
          "split",
        ].includes(
          body.choice
        )
          ? body.choice
          : "stand"
      ) as
        | "hit"
        | "stand"
        | "double"
        | "split";

      state = matchReducer(
        state,
        {
          type: "CHOOSE",
          player: myIndex,
          subIndex:
            Number(
              body.subIndex
            ) || 0,
          choice,
        }
      );

      break;
    }

    case "ADVANCE": {
      state = matchReducer(
        state,
        {
          type: "ADVANCE",
        }
      );

      break;
    }

    case "NEXT_BATTLE": {
      state = matchReducer(
        state,
        {
          type:
            "NEXT_BATTLE",
        }
      );

      break;
    }

    case "FORFEIT": {
      state = matchReducer(
        state,
        {
          type: "FORFEIT",
          player: myIndex,
        }
      );

      break;
    }

    /**
     * De client mag finalization opnieuw triggeren
     * als het eindscherm wel zichtbaar is maar
     * rewards nog niet klaar zijn.
     */
    case "FINALIZE": {
      if (!state.matchOver) {
        return NextResponse.json({
          ok: true,
          state,
          skipped: true,
        });
      }

      try {
        await finalizeMatch(
          params.id
        );

        return NextResponse.json({
          ok: true,
          state,
        });
      } catch (error) {
        return NextResponse.json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Finalization mislukt.",
          },
          {
            status: 500,
          }
        );
      }
    }

    /**
     * Alleen echte PvP-matches gebruiken
     * automatische opponent-timeouts.
     */
    case "AUTO_TIMEOUT": {
      if (
        match.mode !== "pvp"
      ) {
        return NextResponse.json({
          ok: true,
          state,
          skipped: true,
        });
      }

      const IDLE_MS =
        45_000;

      const idleFor =
        Date.now() -
        new Date(
          match.updated_at
        ).getTime();

      if (
        idleFor <
        IDLE_MS
      ) {
        return NextResponse.json({
          ok: true,
          state,
          skipped: true,
        });
      }

      /**
       * Geen inzet geplaatst?
       * Automatisch 0 inzetten.
       */
      if (
        state.phase ===
        "betting"
      ) {
        for (
          const i of [
            0, 1,
          ] as const
        ) {
          if (
            state
              .pendingBets[
              i
            ] == null
          ) {
            state =
              matchReducer(
                state,
                {
                  type: "BET",
                  player: i,
                  amount: 0,
                }
              );
          }
        }
      }

      /**
       * Geen blackjackactie gekozen?
       * Automatisch STAND.
       */
      else if (
        state.phase ===
          "action" &&
        state.hands
      ) {
        for (
          const i of [
            0, 1,
          ] as const
        ) {
          state.hands[
            i
          ].forEach(
            (
              hand,
              subIndex
            ) => {
              if (
                !hand.done &&
                state.pending[
                  i
                ][
                  subIndex
                ] ==
                  null
              ) {
                state =
                  matchReducer(
                    state,
                    {
                      type:
                        "CHOOSE",
                      player: i,
                      subIndex,
                      choice:
                        "stand",
                    }
                  );
              }
            }
          );
        }
      } else {
        return NextResponse.json({
          ok: true,
          state,
          skipped: true,
        });
      }

      break;
    }

    default: {
      return NextResponse.json(
        {
          error:
            "Onbekende actie.",
        },
        {
          status: 400,
        }
      );
    }
  }

  /**
   * Resolve kaarten / ronde indien beide
   * spelers hun actie gekozen hebben.
   */
  state = settle(state);

  /**
   * Campaign en Random Challenger bots
   * spelen automatisch verder.
   */
  state =
    playBotTurns(state);

  /**
   * Compare-and-swap:
   *
   * alleen opslaan wanneer updated_at
   * nog gelijk is aan wat wij geladen hebben.
   *
   * Hierdoor kunnen twee mobiele clients
   * elkaar niet overschrijven met oude state.
   */
  const {
    data: committed,
    error: updateError,
  } = await admin.rpc(
    "commit_match_action_v3",
    {
      p_id: params.id,
      p_updated_at:
        match.updated_at,
      p_state: state,
    }
  );

  if (updateError) {
    return NextResponse.json(
      {
        error:
          updateError.message,
      },
      {
        status: 500,
      }
    );
  }

  /**
   * Iemand anders was sneller.
   *
   * Belangrijk:
   * NOOIT onze oude state over de nieuwe schrijven.
   * De client haalt automatisch de nieuwste versie op.
   */
  if (!committed) {
    const {
      data: latest,
    } = await admin
      .from("matches")
      .select(
        "state, finalized, updated_at"
      )
      .eq("id", params.id)
      .single();

    return NextResponse.json(
      {
        error:
          "Match werd ondertussen aangepast.",
        state:
          latest?.state ??
          state,
        retry: true,
      },
      {
        status: 409,
      }
    );
  }

  /**
   * Als deze actie de match beëindigde,
   * meteen rating/tokens/rewards verwerken.
   */
  if (state.matchOver) {
    try {
      await finalizeMatch(
        params.id
      );
    } catch (error) {
      /**
       * De finale state is al veilig opgeslagen.
       * De client probeert finalization later opnieuw.
       */
      return NextResponse.json(
        {
          ok: true,
          state,
          finalizePending:
            true,
          warning:
            error instanceof Error
              ? error.message
              : "Rewards worden opnieuw geprobeerd.",
        }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    state,
  });
}
