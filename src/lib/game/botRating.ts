import type { BotDefinition } from "./engine";
// This is a balancing heuristic, NOT an empirically calibrated win probability.
export const CAMPAIGN_BOT_RATINGS = [900,1050,1175,1300,1425,1550,1680,1800,1925,2100] as const;
export function randomBotRating(bot: BotDefinition): number {
  const ai = ({naive:-80,basic:0,smart:90,optimal:160} as Record<string,number>)[bot.ai] || 0;
  // Nonlinear ATT/DEF: an extreme specialist can be dangerous, but low DEF matters.
  const offense = bot.atk * 12;
  const defense = bot.def * 10;
  const hp = (bot.hp-90)*3;
  return Math.max(850,Math.min(2200,Math.round(1030+offense+defense+hp+ai)));
}
