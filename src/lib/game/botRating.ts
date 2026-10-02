
import type { BotDefinition } from "./engine";

// Campaign ratings blijven behouden.
export const CAMPAIGN_BOT_RATINGS = [
  900, 1050, 1175, 1300, 1425,
  1550, 1680, 1800, 1925, 2100,
] as const;

export type ChallengerDifficulty = "easy" | "hard";

/**
 * Botrating op basis van daadwerkelijke stats.
 *
 * Easy: ongeveer 850–1660.
 * Hard: ongeveer 1725–2800.
 *
 * Dit is een gameplay-heuristiek, geen gekalibreerde
 * statistische voorspelling.
 */
export function randomBotRating(bot: BotDefinition): number {
  const aiBonus: Record<string, number> = {
    naive: -30,
    basic: 0,
    smart: 35,
    optimal: 70,
  };

  const attackScore = bot.atk * 18;
  const defenseScore = bot.def * 14;
  const healthScore = (bot.hp - 50) * 2;

  const estimated =
    850 +
    attackScore +
    defenseScore +
    healthScore +
    (aiBonus[bot.ai] ?? 0);

  return Math.max(
    800,
    Math.round(estimated)
  );
}

/**
 * Extra bescherming voor wedstrijden tegen bots.
 *
 * Een sterkere bot verslaan geeft potentieel veel rating.
 * Van een sterkere bot verliezen kost relatief weinig.
 *
 * Tegen een zwakke bot geldt het omgekeerde.
 *
 * De bestaande Glicko-2-berekening blijft de basis.
 * We beperken uitsluitend extreme uitschieters
 * omdat de rating van gegenereerde bots geschat is.
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
  const difference = opponentRating - previous.rating;

  // Verwachte winstkans op basis van ratingverschil.
  const expectedWin =
    1 / (1 + Math.pow(10, difference / 400));

  // Dynamische grenzen: minimaal circa 8,
  // maximaal circa 73 ratingpunten.
  const maxGain = Math.round(
    8 + 65 * (1 - expectedWin)
  );

  const maxLoss = Math.round(
    8 + 65 * expectedWin
  );

  const actualChange =
    calculated.rating - previous.rating;

  const adjustedChange = Math.max(
    -maxLoss,
    Math.min(maxGain, actualChange)
  );

  return {
    rating: Math.round(
      previous.rating + adjustedChange
    ),

    // Beperk de daling van ratingonzekerheid per botmatch.
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
