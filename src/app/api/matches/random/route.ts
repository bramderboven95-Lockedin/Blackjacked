
import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";

import { requireUser } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";

import {
  matchReducer,
  MatchState,
} from "@/lib/game/reducer";

import type {
  BotDefinition,
} from "@/lib/game/engine";

import { validRelics } from "@/lib/game/relics";

import {
  randomBotRating,
  type ChallengerDifficulty,
} from "@/lib/game/botRating";

const PREFIXES = [
  "Wild",
  "Crooked",
  "Midnight",
  "Savage",
  "Iron",
  "Lucky",
  "Mad",
  "Shadow",
];

const NAMES = [
  "Jack",
  "Ace",
  "Joker",
  "Queen",
  "Dealer",
  "Shark",
  "Spectre",
  "King",
];

function makeBot(
  difficulty: ChallengerDifficulty
): BotDefinition {

  const name =
    `${PREFIXES[randomInt(PREFIXES.length)]} ` +
    `${NAMES[randomInt(NAMES.length)]}`;

  if (difficulty === "easy") {

    return {
      name: `Easy ${name}`,

      // INCLUSIEF minimum en maximum.
      atk: randomInt(1, 20),
      def: randomInt(1, 20),
      hp: randomInt(50, 151),

      chips: randomInt(1, 4),

      ai: randomInt(2) === 0
        ? "naive"
        : "basic",
    };
  }

  return {
    name: `Hard ${name}`,

    // INCLUSIEF minimum en maximum.
    atk: randomInt(20, 41),
    def: randomInt(20, 41),
    hp: randomInt(151, 351),

    chips: randomInt(2, 6),

    ai: randomInt(2) === 0
      ? "smart"
      : "optimal",
  };
}

/**
 * Zoek een bestaande actieve Random Challenger.
 * Voorkomt dat spelers gratis opnieuw rollen.
 */
async function active(userId: string) {

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("matches")
    .select("id,state,bot_rating")
    .eq("player_a", userId)
    .eq("mode", "random")
    .eq("finalized", false)
    .order("created_at", {
      ascending: false,
    })
    .limit(20);

  if (error) throw error;

  return (
    data || []
  ).find(
    (m: { state: MatchState }) =>
      !(m.state as MatchState).matchOver
  ) || null;
}

/**
 * GET: actieve Challenger ophalen.
 */
export async function GET() {

  const { user } = await requireUser();

  try {
    const m = await active(user.id);

    return NextResponse.json({
      matchId: m?.id || null,

      bot: m
        ? (m.state as MatchState).botDetails
        : null,

      rating: m?.bot_rating ?? null,
    });

  } catch {

    return NextResponse.json(
      {
        error: "Kan Random Challenger niet laden.",
      },
      { status: 500 }
    );
  }
}

/**
 * POST: Easy of Hard Challenger starten.
 */
export async function POST(request: Request) {

  const { user } = await requireUser();

  const admin = createAdminClient();

  const body = await request
    .json()
    .catch(() => ({}));

  const difficulty = body.difficulty;

  if (
    difficulty !== "easy" &&
    difficulty !== "hard"
  ) {
    return NextResponse.json(
      {
        error: "Kies Easy of Hard Challenger.",
      },
      { status: 400 }
    );
  }

  // Eerst controleren of er al een match bestaat.
  try {

    const current = await active(user.id);

    if (current) {
      return NextResponse.json({
        matchId: current.id,
        resumed: true,
      });
    }

  } catch {

    return NextResponse.json(
      {
        error: "Kon actieve match niet controleren.",
      },
      { status: 500 }
    );
  }

  const { data: profile, error } = await admin
    .from("profiles")
    .select(
      "username,preferred_class,relic_levels,equipped_relics"
    )
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json(
      {
        error: "Profiel niet gevonden.",
      },
      { status: 500 }
    );
  }

  // Bot volledig server-side genereren.
  const bot = makeBot(
    difficulty as ChallengerDifficulty
  );

  // Rating volgt uit de gegenereerde botstats.
  const rating = randomBotRating(bot);

  const state = matchReducer(null, {
    type: "INIT",

    nameA: profile.username,
    classA: profile.preferred_class || "dealer",
    perksA: [],

    relicLevelsA:
      profile.relic_levels || {},

    equippedRelicsA: validRelics(
      profile.relic_levels || {},
      profile.equipped_relics || []
    ),

    isCampaign: true,
    botIndex: 0,

    botOverride: bot,
    matchMode: "random",
  });

  // Transactioneel aanmaken:
  // behoudt bestaande match bij gelijktijdige verzoeken.
  const {
    data: created,
    error: createError,
  } = await admin.rpc(
    "create_bot_match_v3",
    {
      p_user: user.id,
      p_mode: "random",
      p_bot_index: null,
      p_bot_rating: rating,
      p_state: state,
    }
  );

  if (createError || !created) {
    return NextResponse.json(
      {
        error:
          createError?.message ||
          "Kon de uitdager niet starten.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json(created);
}
