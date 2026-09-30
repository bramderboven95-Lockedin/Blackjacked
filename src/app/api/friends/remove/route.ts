import { NextResponse } from "next/server";
import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: Request) {
  const { user } = await requireUser();
  const { friendshipId } = await request.json();
  if (!friendshipId) return NextResponse.json({ error: "Ontbrekend verzoek." }, { status: 400 });

  const admin = createAdminClient();
  const { data: friendship } = await admin
    .from("friendships")
    .select("id, requester_id, addressee_id")
    .eq("id", friendshipId)
    .single();

  if (!friendship || (friendship.requester_id !== user.id && friendship.addressee_id !== user.id)) {
    return NextResponse.json({ error: "Niet gevonden." }, { status: 404 });
  }

  const { error } = await admin.from("friendships").delete().eq("id", friendshipId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
