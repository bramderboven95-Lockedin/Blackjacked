import { RELICS, RelicLevels, validRelics, relicValue } from "./relics";
// ============================================================================
// BLACKJACKED — core game engine
// Pure, deterministic, side-effect-free (except createShuffledDeck's RNG).
// Ported directly from the original local-play prototype. Used by:
//   - the server (src/app/api/matches/[id]/action/route.ts) as the single
//     source of truth for every match
//   - the client, only for instant optimistic rendering of hand values
// ============================================================================

export type Suit = { sym: string; color: "ink" | "red" };
export type Card = { rank: string; suit: string; color: "ink" | "red" };

const SUITS: Suit[] = [
  { sym: "\u2660", color: "ink" },
  { sym: "\u2665", color: "red" },
  { sym: "\u2666", color: "red" },
  { sym: "\u2663", color: "ink" },
];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const UNDERDOG_HP = 40;
export const ROUNDS_TO_WIN = 2;
export const PAIR_DAMAGE_CAP = 50;

export function createShuffledDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) deck.push({ rank, suit: suit.sym, color: suit.color });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function computeHandValue(cards: Card[]) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === "A") {
      aces += 1;
      total += 11;
    } else if (c.rank === "K" || c.rank === "Q" || c.rank === "J") {
      total += 10;
    } else {
      total += Number(c.rank);
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return { total, soft: aces > 0 };
}

export function isNaturalBlackjack(cards: Card[]) {
  return cards.length === 2 && computeHandValue(cards).total === 21;
}

export function splitValue(rank: string) {
  if (rank === "A") return "A";
  if (rank === "K" || rank === "Q" || rank === "J" || rank === "10") return "10";
  return rank;
}
export function canSplitCards(cards: Card[]) {
  return cards.length === 2 && splitValue(cards[0].rank) === splitValue(cards[1].rank);
}

export function pairSubhands<T>(subsA: T[], subsB: T[]): [T, T][] {
  const n = Math.max(subsA.length, subsB.length);
  const pairs: [T, T][] = [];
  for (let k = 0; k < n; k++) {
    pairs.push([subsA.length === 1 ? subsA[0] : subsA[k], subsB.length === 1 ? subsB[0] : subsB[k]]);
  }
  return pairs;
}

export interface Stats {
  atk: number;
  def: number;
  bjBonus: number;
  winBonus: number;
  bustGuard: number;
}
export interface Player {
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  chips: number;
  baseChips: number;
  bjBonus: number;
  winBonus: number;
  bustGuard: number;
  wagerMultiplier: number;
  comebackThreshold: number;
  ironWill: boolean;
  ironWillUsed: boolean;
  classId: string | null;
  perks: string[];
  bjWins: number;
  isBot: boolean;
  aiTier?: string;
}

export function effectiveStats(p: Player): Stats {
  const underdog = p.hp > 0 && p.hp <= (p.comebackThreshold || UNDERDOG_HP);
  return {
    atk: p.atk + (underdog ? 3 : 0),
    def: p.def + (underdog ? 2 : 0),
    bjBonus: p.bjBonus || 0,
    winBonus: p.winBonus || 0,
    bustGuard: p.bustGuard || 0,
  };
}

export function computeDamage(
  winnerTotal: number,
  loserTotal: number,
  winnerBlackjack: boolean,
  loserBusted: boolean,
  winnerStats: Stats,
  loserStats: Stats
) {
  let raw = winnerBlackjack ? 28 + (winnerStats.bjBonus || 0) : 6 + Math.max(0, winnerTotal - loserTotal) * 2;
  raw += winnerStats.winBonus || 0;
  if (loserBusted) raw += 10;
  const atkMod = 1 + (winnerStats.atk - 10) * 0.03;
  const defMod = (loserStats.def - 10) * 0.03;
  let dmg = raw * atkMod;
  dmg = dmg - dmg * defMod;
  if (loserBusted) dmg -= loserStats.bustGuard || 0;
  dmg = Math.max(1, Math.round(dmg));
  if (winnerBlackjack) dmg = Math.max(dmg, 20);
  return dmg;
}

export function mutualBustDamage(stats: Stats) {
  const raw = 8;
  const defMod = (stats.def - 10) * 0.03;
  const dmg = raw - raw * defMod - (stats.bustGuard || 0);
  return Math.max(1, Math.round(dmg));
}

export type Outcome = "push" | "mutualBust" | "aWins" | "bWins";
export interface RoundResult {
  aTotal: number;
  bTotal: number;
  aBust: boolean;
  bBust: boolean;
  aBJ: boolean;
  bBJ: boolean;
  dmgToA: number;
  dmgToB: number;
  outcome: Outcome;
}

export function resolveRound(handA: Card[], handB: Card[], statsA: Stats, statsB: Stats): RoundResult {
  const va = computeHandValue(handA);
  const vb = computeHandValue(handB);
  const aBust = va.total > 21;
  const bBust = vb.total > 21;
  const aBJ = isNaturalBlackjack(handA);
  const bBJ = isNaturalBlackjack(handB);
  let dmgToA = 0;
  let dmgToB = 0;
  let outcome: Outcome = "push";

  if (aBust && bBust) {
    dmgToA = mutualBustDamage(statsA);
    dmgToB = mutualBustDamage(statsB);
    outcome = "mutualBust";
  } else if (aBust && !bBust) {
    dmgToA = computeDamage(vb.total, va.total, bBJ, true, statsB, statsA);
    outcome = "bWins";
  } else if (bBust && !aBust) {
    dmgToB = computeDamage(va.total, vb.total, aBJ, true, statsA, statsB);
    outcome = "aWins";
  } else if (aBJ && bBJ) {
    outcome = "push";
  } else if (aBJ) {
    dmgToB = computeDamage(21, vb.total, true, false, statsA, statsB);
    outcome = "aWins";
  } else if (bBJ) {
    dmgToA = computeDamage(21, va.total, true, false, statsB, statsA);
    outcome = "bWins";
  } else if (va.total === vb.total) {
    outcome = "push";
  } else if (va.total > vb.total) {
    dmgToB = computeDamage(va.total, vb.total, false, false, statsA, statsB);
    outcome = "aWins";
  } else {
    dmgToA = computeDamage(vb.total, va.total, false, false, statsB, statsA);
    outcome = "bWins";
  }

  return { aTotal: va.total, bTotal: vb.total, aBust, bBust, aBJ, bBJ, dmgToA, dmgToB, outcome };
}

// ---------------------------------------------------------------------------
// GLICKO-2 — identical to the local-play "Degen-rating" implementation.
// ---------------------------------------------------------------------------
const GLICKO_SCALE = 173.7178;
const GLICKO_TAU = 0.5;
const GLICKO_EPSILON = 0.000001;

function glickoG(phi: number) {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}
function glickoE(mu: number, muJ: number, phiJ: number) {
  return 1 / (1 + Math.exp(-glickoG(phiJ) * (mu - muJ)));
}
export function glicko2Update(
  rating: number,
  rd: number,
  vol: number,
  oppRating: number,
  oppRd: number,
  score: number
) {
  const mu = (rating - 1500) / GLICKO_SCALE;
  const phi = rd / GLICKO_SCALE;
  const muJ = (oppRating - 1500) / GLICKO_SCALE;
  const phiJ = oppRd / GLICKO_SCALE;

  const gPhiJ = glickoG(phiJ);
  const eVal = glickoE(mu, muJ, phiJ);
  const v = 1 / (gPhiJ * gPhiJ * eVal * (1 - eVal));
  const delta = v * gPhiJ * (score - eVal);

  const a = Math.log(vol * vol);
  const f = (x: number) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - a) / (GLICKO_TAU * GLICKO_TAU);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * GLICKO_TAU) < 0 && k < 100) k += 1;
    B = a - k * GLICKO_TAU;
  }

  let fA = f(A);
  let fB = f(B);
  let guard = 0;
  while (Math.abs(B - A) > GLICKO_EPSILON && guard < 100) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB < 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
    guard += 1;
  }
  const newVol = Math.exp(A / 2);

  const phiStar = Math.sqrt(phi * phi + newVol * newVol);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * gPhiJ * (score - eVal);

  return {
    rating: Math.round(GLICKO_SCALE * newMu + 1500),
    rd: Math.round(GLICKO_SCALE * newPhi),
    vol: newVol,
  };
}
export function glicko2Match(
  a: { rating: number; rd: number; vol: number },
  b: { rating: number; rd: number; vol: number },
  scoreA: number
) {
  const newA = glicko2Update(a.rating, a.rd, a.vol, b.rating, b.rd, scoreA);
  const newB = glicko2Update(b.rating, b.rd, b.vol, a.rating, a.rd, 1 - scoreA);
  return [newA, newB] as const;
}

export const RANK_TIERS = [
  { min: -Infinity, max: 1399, name: "Beginner", color: "#8B9A8C" },
  { min: 1400, max: 1499, name: "Rookie Dealer", color: "#9FB0A0" },
  { min: 1500, max: 1599, name: "Card Shark", color: "#3E8E7E" },
  { min: 1600, max: 1699, name: "High Roller", color: "#D4A039" },
  { min: 1700, max: 1799, name: "Pit Boss", color: "#E0883A" },
  { min: 1800, max: 1899, name: "Whale", color: "#C1443C" },
  { min: 1900, max: Infinity, name: "Legend of the Felt", color: "#F0C05A" },
];
export function getRank(rating: number) {
  return RANK_TIERS.find((r) => rating >= r.min && rating <= r.max) || RANK_TIERS[0];
}

// ---------------------------------------------------------------------------
// CLASSES & PERKS
// ---------------------------------------------------------------------------
export const CLASS_DEFS: Record<
  string,
  {
    id: string;
    label: string;
    shortHint: string;
    passive: string;
    dHp?: number;
    dAtk?: number;
    dDef?: number;
    dChips?: number;
    bjBonus?: number;
    winBonus?: number;
    bustGuard?: number;
    wagerMultiplier?: number;
  }
> = {
  dealer: {
    id: "dealer",
    label: "Dealer",
    shortHint: "+15 HP \u00b7 +3 DEF \u00b7 -1 ATK",
    passive: "Croupier's Schild: bust-schade -4.",
    dHp: 15,
    dAtk: -1,
    dDef: 3,
    bustGuard: 4,
  },
  counter: {
    id: "counter",
    label: "Kaartteller",
    shortHint: "+1 ATK \u00b7 +2 schade per winst",
    passive: "Telsysteem: +2 schade bij elke rondewinst, +4 extra bij Blackjack.",
    dAtk: 1,
    bjBonus: 4,
    winBonus: 2,
  },
  gambler: {
    id: "gambler",
    label: "Gokker",
    shortHint: "-10 HP \u00b7 -2 DEF \u00b7 +2 ATK \u00b7 +2 chips",
    passive: "All-In: jouw inzet doet 2,5x schade in plaats van 2x.",
    dHp: -10,
    dAtk: 2,
    dDef: -2,
    dChips: 2,
    wagerMultiplier: 2.5,
  },
};

export interface PerkDef {
  id: string;
  name: string;
  desc: string;
  cost: number;
  tier: "klein" | "middel" | "groot";
  dHp?: number;
  dAtk?: number;
  dDef?: number;
  dChips?: number;
  bjBonus?: number;
  winBonus?: number;
  bustGuard?: number;
  comebackThreshold?: number;
  ironWill?: boolean;
}
export const PERK_DEFS: PerkDef[] = [
  { id: "thick_skin", name: "Dik Vel", desc: "+1 DEF", cost: 15, tier: "klein", dDef: 1 },
  { id: "sharp_eye", name: "Scherpe Blik", desc: "+1 ATK", cost: 15, tier: "klein", dAtk: 1 },
  { id: "beginners_luck", name: "Beginnersgeluk", desc: "+1 chip aan het begin van elke ronde", cost: 12, tier: "klein", dChips: 1 },
  { id: "soft_landing", name: "Zachte Landing", desc: "Bust-schade -3", cost: 15, tier: "klein", bustGuard: 3 },
  { id: "steady_hand", name: "Stevige Hand", desc: "+5 max HP", cost: 30, tier: "middel", dHp: 5 },
  { id: "comeback_kid", name: "Comeback Kid", desc: "Comeback-bonus al vanaf 50 HP", cost: 35, tier: "middel", comebackThreshold: 50 },
  { id: "bj_instinct", name: "Blackjack Instinct", desc: "+4 schade bij Blackjack", cost: 55, tier: "groot", bjBonus: 4 },
  { id: "iron_will", name: "IJzeren Wil", desc: "Overleef 1x per ronde dodelijke schade met 1 HP", cost: 65, tier: "groot", ironWill: true },
];
export const PERK_TIERS = [
  { id: "klein", label: "Klein" },
  { id: "middel", label: "Middel" },
  { id: "groot", label: "Groot" },
] as const;

export function buildPlayer(name: string, classId: string, perkIds: string[], relicLevels: RelicLevels = {}, equippedRelics: string[] = []): Player {
  const cls = CLASS_DEFS[classId] || CLASS_DEFS.dealer;
  let hp = 100 + (cls.dHp || 0);
  const atk = 10 + (cls.dAtk || 0);
  const def = 10 + (cls.dDef || 0);
  let chips = 1 + (cls.dChips || 0);
  let bjBonus = cls.bjBonus || 0;
  let winBonus = cls.winBonus || 0;
  let bustGuard = cls.bustGuard || 0;
  const wagerMultiplier = cls.wagerMultiplier || 2;
  let comebackThreshold = UNDERDOG_HP;
  let ironWill = false;
  for (const pid of perkIds || []) {
    const perk = PERK_DEFS.find((p) => p.id === pid);
    if (!perk) continue;
    hp += perk.dHp || 0;
    chips += perk.dChips || 0;
    bjBonus += perk.bjBonus || 0;
    winBonus += perk.winBonus || 0;
    bustGuard += perk.bustGuard || 0;
    if (perk.comebackThreshold) comebackThreshold = Math.max(comebackThreshold, perk.comebackThreshold);
    if (perk.ironWill) ironWill = true;
  }
  // Relics are separate from the legacy perk inventory. The match snapshots
  // the equipped levels on INIT, so shop upgrades never modify a live match.
  const active = validRelics(relicLevels, equippedRelics);
  const bonus = (id:string) => active.includes(id) ? relicValue(id, Number(relicLevels[id as keyof RelicLevels] || 0)) : 0;
  hp += bonus("steady_hand");
  chips += bonus("beginners_luck");
  bjBonus += bonus("bj_instinct");
  bustGuard += bonus("soft_landing");
  comebackThreshold = Math.max(comebackThreshold, bonus("comeback_kid"));
  ironWill = ironWill || active.includes("iron_will");
  return {
    name,
    hp,
    maxHp: hp,
    atk: atk + bonus("sharp_eye") + (perkIds || []).reduce((s, pid) => s + (PERK_DEFS.find((p) => p.id === pid)?.dAtk || 0), 0),
    def: def + bonus("thick_skin") + (perkIds || []).reduce((s, pid) => s + (PERK_DEFS.find((p) => p.id === pid)?.dDef || 0), 0),
    chips,
    baseChips: chips,
    bjBonus,
    winBonus,
    bustGuard,
    wagerMultiplier,
    comebackThreshold,
    ironWill,
    ironWillUsed: false,
    classId: cls.id,
    perks: [...(perkIds || []), ...active.map(id=>`${RELICS.find(r=>r.id===id)?.name} Lv.${relicLevels[id as keyof RelicLevels]}`)],
    bjWins: 0,
    isBot: false,
  };
}

// ---------------------------------------------------------------------------
// CAMPAIGN BOTS
// Difficulty curve widened on purpose: bot 1 is now a genuine easy intro
// (low stats, never doubles/splits/wagers), bot 10 is a real wall (highest
// stats + best AI). Every bot in between was rebalanced to keep a smooth
// ramp rather than clustering in the middle.
// ---------------------------------------------------------------------------
export const BOTS = [
  { name: "Lucky Lenny", hp: 70, atk: 7, def: 7, chips: 1, ai: "naive" },
  { name: "Ace Amy", hp: 78, atk: 8, def: 8, chips: 1, ai: "naive" },
  { name: "Steady Steve", hp: 86, atk: 9, def: 9, chips: 2, ai: "basic" },
  { name: "Ridge the Reader", hp: 94, atk: 10, def: 10, chips: 2, ai: "basic" },
  { name: "Diamond Dana", hp: 102, atk: 11, def: 11, chips: 2, ai: "smart" },
  { name: "Baron Bluff", hp: 110, atk: 13, def: 12, chips: 3, ai: "smart" },
  { name: "Countess Chip", hp: 118, atk: 14, def: 13, chips: 3, ai: "smart" },
  { name: "Iron Ivy", hp: 126, atk: 16, def: 14, chips: 4, ai: "optimal" },
  { name: "The Shark", hp: 134, atk: 17, def: 15, chips: 4, ai: "optimal" },
  { name: "The House", hp: 145, atk: 19, def: 17, chips: 5, ai: "optimal" },
];

export type BotDefinition = { name: string; hp: number; atk: number; def: number; chips: number; ai: string };
export function buildBotPlayer(botIndex: number, override?: BotDefinition): Player {
  const bot = override || BOTS[botIndex];
  return {
    name: bot.name,
    hp: bot.hp,
    maxHp: bot.hp,
    atk: bot.atk,
    def: bot.def,
    chips: bot.chips,
    baseChips: bot.chips,
    bjBonus: 0,
    winBonus: 0,
    bustGuard: 0,
    wagerMultiplier: 2,
    comebackThreshold: UNDERDOG_HP,
    ironWill: false,
    ironWillUsed: false,
    classId: null,
    perks: [],
    bjWins: 0,
    isBot: true,
    aiTier: bot.ai,
  };
}

export function botDecideBet(aiTier: string, chips: number) {
  if (chips < 1) return 0;
  const prob: Record<string, number> = { naive: 0, basic: 0.35, smart: 0.6, optimal: 0.85 };
  return Math.random() < (prob[aiTier] || 0) ? 1 : 0;
}
export function botDecideAction(
  aiTier: string,
  subhand: { cards: Card[] },
  canSplitNow: boolean,
  opponentBestTotal: number | null
) {
  const val = computeHandValue(subhand.cards);
  const canDouble = subhand.cards.length === 2;
  if (canDouble && aiTier !== "naive" && !val.soft && val.total >= 9 && val.total <= 11) return "double";
  if (canSplitNow && (aiTier === "smart" || aiTier === "optimal")) {
    const rv = splitValue(subhand.cards[0].rank);
    if (rv === "A" || rv === "8") return "split";
  }
  const baseStand: Record<string, number> = { naive: 17, basic: 16, smart: 15, optimal: 15 };
  let standAt = baseStand[aiTier] || 17;
  if (aiTier === "optimal" && opponentBestTotal != null && opponentBestTotal <= 21) {
    standAt = Math.max(12, Math.min(20, opponentBestTotal));
  }
  return val.total < standAt ? "hit" : "stand";
}

// ---------------------------------------------------------------------------
// ACHIEVEMENTS
// ---------------------------------------------------------------------------
export interface ProfileForAchievements {
  wins: number;
  bestStreak: number;
  matches_played: number;
  rating: number;
  campaign_pos: number;
  campaign_wins: number;
  perks: string[];
  tokens_earned_total: number;
  achievements: string[];
  stats: { blackjacks: number; busts: number; doubles: number; splits: number; kos: number; comebackWins: number; ironWillSaves: number };
}
export const ACHIEVEMENTS = [
  { id: "first_blood", name: "Eerste Bloed", desc: "Win je allereerste match", icon: "\u{1F31F}", check: (p: ProfileForAchievements) => p.wins >= 1 },
  { id: "natural", name: "Natural", desc: "Krijg je eerste Blackjack", icon: "\u{1F0CF}", check: (p: ProfileForAchievements) => p.stats.blackjacks >= 1 },
  { id: "hat_trick", name: "Hattrick", desc: "Win 3 matches op een rij", icon: "\u{1F525}", check: (p: ProfileForAchievements) => p.bestStreak >= 3 },
  { id: "on_fire", name: "In Brand", desc: "Win 7 matches op een rij", icon: "\u{1F308}", check: (p: ProfileForAchievements) => p.bestStreak >= 7 },
  { id: "veteran", name: "Vaste Klant", desc: "Speel 25 matches", icon: "\u{1F3B0}", check: (p: ProfileForAchievements) => p.matches_played >= 25 },
  { id: "card_counter", name: "Kaartenteller", desc: "Krijg 10 Blackjacks", icon: "\u{1F9E0}", check: (p: ProfileForAchievements) => p.stats.blackjacks >= 10 },
  { id: "daredevil", name: "Waaghals", desc: "Speel 20 keer Double Down", icon: "\u{1F3AF}", check: (p: ProfileForAchievements) => p.stats.doubles >= 20 },
  { id: "splitter", name: "Splijter", desc: "Split 10 keer", icon: "\u2702\uFE0F", check: (p: ProfileForAchievements) => p.stats.splits >= 10 },
  { id: "bust_club", name: "Bust Club", desc: "Ga 25 keer bust", icon: "\u{1F4A5}", check: (p: ProfileForAchievements) => p.stats.busts >= 25 },
  { id: "comeback_king", name: "Comeback Koning", desc: "Win een match na een comeback-bonus", icon: "\u{1F451}", check: (p: ProfileForAchievements) => p.stats.comebackWins >= 1 },
  { id: "unbreakable", name: "Onbreekbaar", desc: "Overleef 3x met IJzeren Wil", icon: "\u{1F6E1}\uFE0F", check: (p: ProfileForAchievements) => p.stats.ironWillSaves >= 3 },
  { id: "high_roller", name: "High Roller", desc: "Bereik rating 1600", icon: "\u{1F48E}", check: (p: ProfileForAchievements) => p.rating >= 1600 },
  { id: "legend", name: "Legende", desc: "Bereik rating 1900", icon: "\u{1F3C6}", check: (p: ProfileForAchievements) => p.rating >= 1900 },
  { id: "climber", name: "Klimmer", desc: "Versla 5 campaign-bots", icon: "\u{1FA9C}", check: (p: ProfileForAchievements) => p.campaign_wins >= 5 },
  { id: "house_wins", name: "Het Huis Valt", desc: "Versla The House", icon: "\u{1F3DB}\uFE0F", check: (p: ProfileForAchievements) => p.campaign_pos >= BOTS.length - 1 && p.campaign_wins >= BOTS.length },
  { id: "collector", name: "Verzamelaar", desc: "Unlock 4 perks", icon: "\u{1F9F0}", check: (p: ProfileForAchievements) => p.perks.length >= 4 },
  { id: "loaded", name: "Rijk Gestikt", desc: "Verdien 100 tokens in totaal", icon: "\u{1F39F}\uFE0F", check: (p: ProfileForAchievements) => p.tokens_earned_total >= 100 },
];
export function checkAchievements(profile: ProfileForAchievements) {
  return ACHIEVEMENTS.filter((a) => !profile.achievements.includes(a.id) && a.check(profile)).map((a) => a.id);
}
