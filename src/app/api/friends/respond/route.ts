import { NextResponse } from "next/server";
import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { user } = await requireUser();
  const { friendshipId, accept } = await request.json();
  if (!friendshipId) return NextResponse.json({ error: "Ontbrekend verzoek." }, { status: 400 });

  const admin = createAdminClient();
  const { data: friendship } = await admin
    .from("friendships")
    .select("id, requester_id, addressee_id, status")
    .eq("id", friendshipId)
    .single();

  if (!friendship || friendship.addressee_id !== user.id) {
    return NextResponse.json({ error: "Verzoek niet gevonden." }, { status: 404 });
  }
  if (friendship.status !== "pending") {
    return NextResponse.json({ error: "Dit verzoek is al afgehandeld." }, { status: 400 });
  }

  const newStatus = accept ? "accepted" : "declined";
  const { error: updateError } = await admin
    .from("friendships")
    .update({ status: newStatus, responded_at: new Date().toISOString() })
    .eq("id", friendshipId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (accept) {
    const { data: me } = await admin.from("profiles").select("username").eq("id", user.id).single();
    await admin.from("notifications").insert({
      user_id: friendship.requester_id,
      type: "friend_accepted",
      payload: { byUsername: me?.username },
    });
  }

  return NextResponse.json({ ok: true });
}
