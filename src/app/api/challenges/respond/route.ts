import { NextResponse } from "next/server";
import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { matchReducer } from "@/lib/game/reducer";
import { validRelics } from "@/lib/game/relics";

export async function POST(request: Request) {
  const { user } = await requireUser();
  const { challengeId, accept } = await request.json();
  if (!challengeId) return NextResponse.json({ error: "Ontbrekende uitdaging." }, { status: 400 });

  const admin = createAdminClient();
  const { data: challenge } = await admin
    .from("challenges")
    .select("id, challenger_id, opponent_id, status")
    .eq("id", challengeId)
    .single();

  if (!challenge || challenge.opponent_id !== user.id) {
    return NextResponse.json({ error: "Uitdaging niet gevonden." }, { status: 404 });
  }
  if (challenge.status !== "pending") {
    return NextResponse.json({ error: "Deze uitdaging is al afgehandeld." }, { status: 400 });
  }

  if (!accept) {
    await admin
      .from("challenges")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", challengeId);
    const { data: me } = await admin.from("profiles").select("username").eq("id", user.id).single();
    await admin.from("notifications").insert({
      user_id: challenge.challenger_id,
      type: "challenge_declined",
      payload: { byUsername: me?.username },
    });
    return NextResponse.json({ ok: true });
  }

  const { data: players } = await admin
    .from("profiles")
    .select("id, username, preferred_class, relic_levels, equipped_relics")
    .in("id", [challenge.challenger_id, challenge.opponent_id]);

  const a = players?.find((p) => p.id === challenge.challenger_id);
  const b = players?.find((p) => p.id === challenge.opponent_id);
  if (!a || !b) return NextResponse.json({ error: "Spelers niet gevonden." }, { status: 500 });

  const initState = matchReducer(null, {
    type: "INIT",
    nameA: a.username,
    nameB: b.username,
    classA: a.preferred_class || "dealer",
    classB: b.preferred_class || "dealer",
    perksA: [],
    relicLevelsA: a.relic_levels || {},
    equippedRelicsA: validRelics(a.relic_levels || {}, a.equipped_relics || []),
    perksB: [],
    relicLevelsB: b.relic_levels || {},
    equippedRelicsB: validRelics(b.relic_levels || {}, b.equipped_relics || []),
  });

  const { data: match, error: matchError } = await admin
    .from("matches")
    .insert({
      player_a: challenge.challenger_id,
      player_b: challenge.opponent_id,
      is_campaign: false,
      state: initState,
    })
    .select("id")
    .single();
  if (matchError) return NextResponse.json({ error: matchError.message }, { status: 500 });

  await admin
    .from("challenges")
    .update({ status: "accepted", match_id: match.id, responded_at: new Date().toISOString() })
    .eq("id", challengeId);

  await admin.from("notifications").insert({
    user_id: challenge.challenger_id,
    type: "challenge_accepted",
    payload: { byUsername: b.username, matchId: match.id },
  });

  return NextResponse.json({ ok: true, matchId: match.id });
}
