
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
  const body = await request.json();
  const admin = createAdminClient();

  const { data: match } = await admin
    .from("matches")
    .select(
      "id, player_a, player_b, is_campaign, mode, state, finalized, updated_at"
    )
    .eq("id", params.id)
    .single();

  if (!match) {
    return NextResponse.json(
      { error: "Match niet gevonden." },
      { status: 404 }
    );
  }

  if (match.finalized) {
    return NextResponse.json(
      { error: "Deze match is al afgelopen." },
      { status: 400 }
    );
  }

  // Bepaal de speler via de ingelogde sessie.
  let myIndex: 0 | 1;

  if (match.player_a === user.id) {
    myIndex = 0;
  } else if (match.player_b === user.id) {
    myIndex = 1;
  } else {
    return NextResponse.json(
      { error: "Je speelt niet mee in deze match." },
      { status: 403 }
    );
  }

  let state = match.state as MatchState;
  // A previous request may have saved the final state but lost its HTTP response.
  // Retrying finalization is safe because the SQL transaction is idempotent.
  if (state.matchOver) {
    try { await finalizeMatch(params.id); }
    catch (error) {return NextResponse.json({error:error instanceof Error?error.message:"Finalize failed"},{status:500});}
    return NextResponse.json({ok:true,state});
  }


  switch (body.type) {
    case "BET": {
      state = matchReducer(state, {
        type: "BET",
        player: myIndex,
        amount: body.amount === 1 ? 1 : 0,
      });
      break;
    }

    case "CHOOSE": {
      const choice = (
        ["hit", "stand", "double", "split"].includes(body.choice)
          ? body.choice
          : "stand"
      ) as "hit" | "stand" | "double" | "split";

      state = matchReducer(state, {
        type: "CHOOSE",
        player: myIndex,
        subIndex: Number(body.subIndex) || 0,
        choice,
      });
      break;
    }

    case "ADVANCE": {
      state = matchReducer(state, {
        type: "ADVANCE",
      });
      break;
    }

    case "NEXT_BATTLE": {
      state = matchReducer(state, {
        type: "NEXT_BATTLE",
      });
      break;
    }

    // NIEUW: opgeven mag ook tegen een bot.
    case "FORFEIT": {
      state = matchReducer(state, {
        type: "FORFEIT",
        player: myIndex,
      });
      break;
    }

    case "AUTO_TIMEOUT": {
      if (match.mode !== "pvp") return NextResponse.json({ok:true,state,skipped:true});
      const IDLE_MS = 45_000;

      const idleFor =
        Date.now() -
        new Date(match.updated_at).getTime();

      if (idleFor < IDLE_MS) {
        return NextResponse.json({
          ok: true,
          state,
          skipped: true,
        });
      }

      if (state.phase === "betting") {
        for (const i of [0, 1] as const) {
          if (state.pendingBets[i] == null) {
            state = matchReducer(state, {
              type: "BET",
              player: i,
              amount: 0,
            });
          }
        }
      } else if (
        state.phase === "action" &&
        state.hands
      ) {
        for (const i of [0, 1] as const) {
          state.hands[i].forEach((h, si) => {
            if (
              !h.done &&
              state.pending[i][si] == null
            ) {
              state = matchReducer(state, {
                type: "CHOOSE",
                player: i,
                subIndex: si,
                choice: "stand",
              });
            }
          });
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

    default:
      return NextResponse.json(
        { error: "Onbekende actie." },
        { status: 400 }
      );
  }

  state = settle(state);
  state = playBotTurns(state);

  const { data: committed, error: updateError } = await admin.rpc("commit_match_action_v3",{
    p_id:params.id,p_updated_at:match.updated_at,p_state:state
  });
  if (updateError) return NextResponse.json({error:updateError.message},{status:500});
  if (!committed) {
    // Another request committed first. Never overwrite its state with a stale copy.
    return NextResponse.json({error:"Match changed; refresh and retry."},{status:409});
  }
  if (state.matchOver) {
    try {await finalizeMatch(params.id);}
    catch(error){
      return NextResponse.json({error:error instanceof Error?error.message:"Match opgeslagen; finalize opnieuw proberen."},{status:500});
    }
  }
  return NextResponse.json({ok:true,state});
}
