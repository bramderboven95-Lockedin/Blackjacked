import type { BotDefinition } from "./engine";

/**
 * Blackjacked — Simulation calibrated bot ratings.
 *
 * Reference character:
 * Rating: 1500
 * HP: 100
 * ATK: 10
 * DEF: 10
 * Chips: 1
 * No Relics
 * Basic strategy
 *
 * Campaign: 5000 simulated matches per bot.
 * Random: 140 tested stat combinations,
 * 1000 matches per combination.
 */

export const CAMPAIGN_BOT_RATINGS = [
  1158,
  1251,
  1442,
  1506,
  1569,
  1706,
  1772,
  1852,
  1917,
  2143,
] as const;

export type ChallengerDifficulty = "easy" | "hard";

const clamp = (
  n: number,
  low: number,
  high: number
) => Math.min(high, Math.max(low, n));

/**
 * Rating van Random Challengers.
 *
 * Easy:
 * ATK 1–19
 * DEF 1–19
 * HP 50–150
 *
 * Hard:
 * ATK 20–40
 * DEF 20–40
 * HP 151–350
 */
export function randomBotRating(
  bot: BotDefinition
): number {
  /**
   * BotDefinition heeft geen apart difficulty-veld.
   * De Random Challenger route maakt Easy en Hard
   * al met aparte statranges.
   *
   * Daarom herkennen we Hard aan zijn stats.
   */
  const hard =
    bot.atk >= 20 &&
    bot.def >= 20 &&
    bot.hp >= 151;

  // EASY CHALLENGER
  if (!hard) {
    const a = clamp(
      (bot.atk - 1) / 18,
      0,
      1
    );

    const d = clamp(
      (bot.def - 1) / 18,
      0,
      1
    );

    const h = clamp(
      (bot.hp - 50) / 100,
      0,
      1
    );

    const c = clamp(
      (bot.chips - 1) / 2,
      0,
      1
    );

    const ai =
      bot.ai === "basic"
        ? 1
        : 0;

    const estimate =
      815.75 +
      278.84 * a +
      212.59 * d +
      552.21 * h +
      109.89 * ai +
      180.94 * d * h +
      39.59 * a * c +
      22.73 * h * c +
      52.13 * d * d;

    return Math.round(
      clamp(
        estimate,
        800,
        2300
      )
    );
  }

  // HARD CHALLENGER

  const a = clamp(
    (bot.atk - 20) / 20,
    0,
    1
  );

  const d = clamp(
    (bot.def - 20) / 20,
    0,
    1
  );

  const h = clamp(
    (bot.hp - 151) / 199,
    0,
    1
  );

  const c = clamp(
    (bot.chips - 2) / 3,
    0,
    1
  );

  const estimate =
    2246.03 +
    128.78 * a +
    440.27 * d +
    376.98 * h +
    20.99 * c +
    40.16 * a * c +
    24.32 * h * c +
    253.35 * d * d;

  return Math.round(
    clamp(
      estimate,
      2200,
      3600
    )
  );
}

/**
 * Bescherming tegen extreme ratingwijzigingen
 * bij wedstrijden tegen bots.
 */
export function protectedBotRating(
  previous: {
    rating: number;
    rd: number;
    vol: number;
  },

  calculated: {
    rating: number;
    rd: number;
    vol: number;
  },

  opponentRating: number
) {
  const difference =
    opponentRating -
    previous.rating;

  const expectedWin =
    1 /
    (
      1 +
      Math.pow(
        10,
        difference / 400
      )
    );

  const maxGain =
    Math.round(
      8 +
      65 *
        (1 - expectedWin)
    );

  const maxLoss =
    Math.round(
      8 +
      65 *
        expectedWin
    );

  const actualChange =
    calculated.rating -
    previous.rating;

  const adjustedChange =
    clamp(
      actualChange,
      -maxLoss,
      maxGain
    );

  return {
    rating: Math.round(
      previous.rating +
      adjustedChange
    ),

    rd: Math.max(
      45,
      Math.round(
        Math.max(
          calculated.rd,
          previous.rd - 12
        )
      )
    ),

    vol: calculated.vol,
  };
}
