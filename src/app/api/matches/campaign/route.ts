import { NextResponse } from "next/server";
import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchReducer } from "@/lib/game/reducer";
import { BOTS, PERK_DEFS } from "@/lib/game/engine";

export async function POST() {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("profiles")
    .select("username, campaign_pos, preferred_class, preferred_perks, perks")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "Profiel niet gevonden." }, { status: 404 });

  const botIndex = Math.min(profile.campaign_pos, BOTS.length - 1);
  const validPerks = (profile.preferred_perks || [])
    .filter((pid: string) => (profile.perks || []).includes(pid) && PERK_DEFS.some((p) => p.id === pid))
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
    .insert({ player_a: user.id, player_b: null, is_campaign: true, bot_index: botIndex, state: initState })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ matchId: match.id });
}
