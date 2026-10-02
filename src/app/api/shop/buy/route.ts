import { NextResponse } from "next/server";
import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { RELICS } from "@/lib/game/relics";

export async function POST(request: Request) {
  const { user } = await requireUser();
  const { relicId } = await request.json();
  const relic = RELICS.find(r => r.id === relicId);
  if (!relic) return NextResponse.json({ error: "Onbekende Relic." }, { status: 400 });
  const admin = createAdminClient();
  const { data: profile, error } = await admin.from("profiles").select("relic_levels").eq("id",user.id).single();
  if (error || !profile) return NextResponse.json({ error: "Profiel niet gevonden. Is de SQL-migratie uitgevoerd?" }, { status: 500 });
  const current = Number(profile.relic_levels?.[relicId] || 0);
  if (current >= relic.costs.length) return NextResponse.json({ error: "Maximaal level bereikt." }, { status: 400 });
  // Cost and next level are determined by server definitions, never client input.
  const { data, error: buyError } = await admin.rpc("buy_relic_atomic", {
    p_user: user.id, p_id: relicId, p_expected_level: current, p_cost: relic.costs[current],
  });
  if (buyError) return NextResponse.json({ error: buyError.message }, { status: 400 });
  return NextResponse.json({ ok: true, ...data });
}
