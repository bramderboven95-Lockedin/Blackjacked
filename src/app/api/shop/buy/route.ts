import { NextResponse } from "next/server";
import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERK_DEFS } from "@/lib/game/engine";

export async function POST(request: Request) {
  const { user } = await requireUser();
  const { perkId } = await request.json();
  const perk = PERK_DEFS.find((p) => p.id === perkId);
  if (!perk) return NextResponse.json({ error: "Onbekende perk." }, { status: 400 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from("profiles").select("tokens, perks").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profiel niet gevonden." }, { status: 404 });

  const owned: string[] = profile.perks || [];
  if (owned.includes(perkId)) return NextResponse.json({ error: "Je hebt deze perk al." }, { status: 400 });
  if (profile.tokens < perk.cost) return NextResponse.json({ error: "Niet genoeg tokens." }, { status: 400 });

  const { error } = await admin
    .from("profiles")
    .update({ tokens: profile.tokens - perk.cost, perks: [...owned, perkId] })
    .eq("id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
