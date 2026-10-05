import { NextResponse } from "next/server";

import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const { user } = await requireUser();
  const admin = createAdminClient();

  const { data: match, error } = await admin
    .from("matches")
    .select(
      `
        id,
        player_a,
        player_b,
        is_campaign,
        mode,
        state,
        finalized,
        updated_at,
        rewards,
        bot_rating
      `
    )
    .eq("id", params.id)
    .single();

  if (error || !match) {
    return NextResponse.json(
      {
        error: "Match niet gevonden.",
      },
      {
        status: 404,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  const isParticipant =
    match.player_a === user.id ||
    match.player_b === user.id;

  if (!isParticipant) {
    return NextResponse.json(
      {
        error: "Geen toegang tot deze match.",
      },
      {
        status: 403,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }

  return NextResponse.json(
    {
      match,
    },
    {
      headers: {
        "Cache-Control":
          "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    }
  );
}
