import { NextResponse } from "next/server";
import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { user } = await requireUser();
  const { targetUsername } = await request.json();
  if (!targetUsername || typeof targetUsername !== "string") {
    return NextResponse.json({ error: "Gebruikersnaam vereist." }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: target } = await admin
    .from("profiles")
    .select("id, username")
    .ilike("username", targetUsername.trim())
    .maybeSingle();

  if (!target) return NextResponse.json({ error: "Speler niet gevonden." }, { status: 404 });
  if (target.id === user.id) return NextResponse.json({ error: "Je kan jezelf niet toevoegen." }, { status: 400 });

  const { data: existing } = await admin
    .from("friendships")
    .select("id, status, requester_id, addressee_id")
    .or(
      `and(requester_id.eq.${user.id},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${user.id})`
    )
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") return NextResponse.json({ error: "Jullie zijn al vrienden." }, { status: 400 });
    if (existing.status === "pending") return NextResponse.json({ error: "Er staat al een verzoek open." }, { status: 400 });
  }

  const { data: me } = await admin.from("profiles").select("username").eq("id", user.id).single();

  const { error: insertError } = await admin
    .from("friendships")
    .insert({ requester_id: user.id, addressee_id: target.id, status: "pending" });
  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  await admin.from("notifications").insert({
    user_id: target.id,
    type: "friend_request",
    payload: { fromUsername: me?.username, fromId: user.id },
  });

  return NextResponse.json({ ok: true });
}
