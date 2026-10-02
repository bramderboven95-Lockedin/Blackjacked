
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchReducer, MatchState } from "@/lib/game/reducer";
import { BOTS, PERK_DEFS } from "@/lib/game/engine";

// Zoek de meest recente onafgewerkte Campaign-match.
async function findActiveCampaign(userId: string) {
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("matches")
    .select("id, state, bot_index")
    .eq("player_a", userId)
    .eq("is_campaign", true)
    .eq("finalized", false)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (
    (data || []).find(
      (match) => !(match.state as MatchState).matchOver
    ) || null
  );
}

// Wordt aangeroepen wanneer de Campaign-pagina opent.
export async function GET() {
  const { user } = await requireUser();

  try {
    const active = await findActiveCampaign(user.id);

    return NextResponse.json({
      activeMatchId: active?.id ?? null,
      botIndex: active?.bot_index ?? null,
    });
  } catch {
    return NextResponse.json(
      { error: "Kon je actieve wedstrijd niet ophalen." },
      { status: 500 }
    );
  }
}

// Hervat een bestaande wedstrijd of maak een nieuwe aan.
export async function POST() {
  const { user } = await requireUser();
  const admin = createAdminClient();

  try {
    const active = await findActiveCampaign(user.id);

    if (active) {
      return NextResponse.json({
        matchId: active.id,
        resumed: true,
      });
    }
  } catch {
    return NextResponse.json(
      { error: "Kon je bestaande wedstrijd niet controleren." },
      { status: 500 }
    );
  }

  const { data: profile } = await admin
    .from("profiles")
    .select(
      "username, campaign_pos, preferred_class, preferred_perks, perks"
    )
    .eq("id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json(
      { error: "Profiel niet gevonden." },
      { status: 404 }
    );
  }

  const botIndex = Math.min(
    Math.max(0, profile.campaign_pos ?? 0),
    BOTS.length - 1
  );

  const validPerks = (profile.preferred_perks || [])
    .filter(
      (pid: string) =>
        (profile.perks || []).includes(pid) &&
        PERK_DEFS.some((perk) => perk.id === pid)
    )
    .slice(0, 2);

  const initState = matchReducer(null, {
    type: "INIT",
    nameA: profile.username,
    classA: profile.preferred_class || "dealer",
    perksA: validPerks,
    isCampaign: true,
    botIndex,
  });

  const { data: match, error } = await admin
    .from("matches")
    .insert({
      player_a: user.id,
      player_b: null,
      is_campaign: true,
      bot_index: botIndex,
      state: initState,
    })
    .select("id")
    .single();

  if (error || !match) {
    return NextResponse.json(
      { error: error?.message || "Kon wedstrijd niet starten." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    matchId: match.id,
    resumed: false,
  });
}
