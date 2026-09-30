import { NextResponse } from "next/server";
import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { user } = await requireUser();
  const { opponentId } = await request.json();
  if (!opponentId) return NextResponse.json({ error: "Geen tegenstander opgegeven." }, { status: 400 });
  if (opponentId === user.id) return NextResponse.json({ error: "Je kan jezelf niet uitdagen." }, { status: 400 });

  const admin = createAdminClient();

  const { data: friendship } = await admin
    .from("friendships")
    .select("status")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${opponentId}),and(requester_id.eq.${opponentId},addressee_id.eq.${user.id})`
    )
    .eq("status", "accepted")
    .maybeSingle();
  if (!friendship) return NextResponse.json({ error: "Jullie moeten eerst vrienden zijn." }, { status: 400 });

  const { data: existing } = await admin
    .from("challenges")
    .select("id")
    .eq("challenger_id", user.id)
    .eq("opponent_id", opponentId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) return NextResponse.json({ error: "Je hebt deze speler al uitgedaagd." }, { status: 400 });

  const { data: me } = await admin.from("profiles").select("username").eq("id", user.id).single();

  const { data: challenge, error } = await admin
    .from("challenges")
    .insert({ challenger_id: user.id, opponent_id: opponentId, status: "pending" })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("notifications").insert({
    user_id: opponentId,
    type: "challenge",
    payload: { fromUsername: me?.username, fromId: user.id, challengeId: challenge.id },
  });

  return NextResponse.json({ ok: true, challengeId: challenge.id });
}
