// ============================================================================
// Server-authoritative match reducer.
// This is the ONLY place match state changes. The API route
// (src/app/api/matches/[id]/action/route.ts) loads the current row, applies
// one action via `matchReducer`, and writes the result back — always with
// the acting player's index derived from their authenticated session, never
// trusted from the request body. That's what makes this "server-authoritative":
// a client can only ever act as itself.
// ============================================================================
import {
  BOTS,
  Card,
  Player,
  botDecideAction,
  botDecideBet,
  buildBotPlayer,
  buildPlayer,
  canSplitCards,
  computeHandValue,
  createShuffledDeck,
  effectiveStats,
  isNaturalBlackjack,
  pairSubhands,
  resolveRound,
  ROUNDS_TO_WIN,
  PAIR_DAMAGE_CAP,
  UNDERDOG_HP,
} from "./engine";

export interface SubHand {
  cards: Card[];
  done: boolean;
  busted: boolean;
  doubled: boolean;
  split: boolean;
}
export interface PairResult {
  aTotal: number;
  bTotal: number;
  aBust: boolean;
  bBust: boolean;
  aBJ: boolean;
  bBJ: boolean;
  dmgToA: number;
  dmgToB: number;
  outcome: string;
  doubledA: boolean;
  doubledB: boolean;
}
export interface LastResult {
  pairs: PairResult[];
  dmgToA: number;
  dmgToB: number;
  betA: number;
  betB: number;
  aBJ: boolean;
  bBJ: boolean;
  splitA: boolean;
  splitB: boolean;
  ironWillA: boolean;
  ironWillB: boolean;
  comebackA: boolean;
  comebackB: boolean;
  battleOver: boolean;
  battleWinnerIndex: number | null;
  roundsWon: [number, number];
}
export interface MatchStat {
  blackjacks: number;
  busts: number;
  doubles: number;
  splits: number;
  ironWillSaves: number;
  usedComeback: boolean;
}
export type Phase = "betting" | "action" | "readyToResolve" | "roundResult" | "roundOver" | "finisher" | "matchEnd";

export interface MatchState {
  players: [Player, Player];
  isCampaign: boolean;
  botIndex: number | null;
  matchOver: boolean;
  winnerIndex: number | null; // 0, 1, or -1 for draw
  roundsWon: [number, number];
  roundNum: number;
  round: number;
  matchStats: [MatchStat, MatchStat];
  lastResult: LastResult | null;
  phase: Phase;
  pendingBets: [number | null, number | null];
  bets: [number, number] | null;
  hands: [SubHand[], SubHand[]] | null;
  pending: [Array<string | null>, Array<string | null>];
  deck: Card[];
}

export type Action =
  | { type: "INIT"; nameA: string; nameB?: string; classA: string; classB?: string; perksA: string[]; perksB?: string[]; isCampaign?: boolean; botIndex?: number }
  | { type: "BET"; player: 0 | 1; amount: number }
  | { type: "CHOOSE"; player: 0 | 1; subIndex: number; choice: "hit" | "stand" | "double" | "split" }
  | { type: "RESOLVE_ROUND" }
  | { type: "ADVANCE" }
  | { type: "NEXT_BATTLE" }
  | { type: "FORFEIT"; player: 0 | 1 }
  | { type: "FINISH" };

function dealRoundState(round: number) {
  const deck = createShuffledDeck();
  const handA = [deck.pop()!, deck.pop()!];
  const handB = [deck.pop()!, deck.pop()!];
  const hands: [SubHand[], SubHand[]] = [
    [{ cards: handA, done: false, busted: false, doubled: false, split: false }],
    [{ cards: handB, done: false, busted: false, doubled: false, split: false }],
  ];
  if (isNaturalBlackjack(handA)) hands[0][0].done = true;
  if (isNaturalBlackjack(handB)) hands[1][0].done = true;
  const phase: Phase = hands[0][0].done && hands[1][0].done ? "readyToResolve" : "action";
  return { deck, hands, round, pending: [[null], [null]] as [Array<string | null>, Array<string | null>], phase };
}

// Shared by BET and by the auto-skip step below: once both pendingBets are
// filled in, deduct chips, compute the multiplier, and deal the round.
function resolveBetsIfReady(state: MatchState, pendingBets: [number | null, number | null]): MatchState {
  if (pendingBets[0] == null || pendingBets[1] == null) return { ...state, pendingBets };
  const players = state.players.map((p, i) => ({ ...p, chips: p.chips - (pendingBets[i] || 0) })) as [Player, Player];
  const bets: [number, number] = [
    pendingBets[0] ? state.players[0].wagerMultiplier || 2 : 1,
    pendingBets[1] ? state.players[1].wagerMultiplier || 2 : 1,
  ];
  return { ...state, players, pendingBets: [null, null], bets, ...dealRoundState(state.round) };
}

// A player with 0 chips has no real betting decision to make — auto-select
// "no bet" for them instead of making them click through an empty choice.
// If both players are at 0 chips this deals the round immediately with no
// clicks needed at all.
function autoSkipZeroChipBets(state: MatchState): MatchState {
  if (state.phase !== "betting") return state;
  const pendingBets: [number | null, number | null] = [...state.pendingBets];
  for (const i of [0, 1] as const) {
    if (pendingBets[i] == null && state.players[i].chips < 1) pendingBets[i] = 0;
  }
  return resolveBetsIfReady(state, pendingBets);
}

export function matchReducer(state: MatchState | null, action: Action): MatchState {
  switch (action.type) {
    case "INIT": {
      const players: [Player, Player] = action.isCampaign
        ? [buildPlayer(action.nameA, action.classA, action.perksA), buildBotPlayer(action.botIndex!)]
        : [
            buildPlayer(action.nameA, action.classA, action.perksA),
            buildPlayer(action.nameB!, action.classB!, action.perksB || []),
          ];
      return autoSkipZeroChipBets({
        players,
        isCampaign: !!action.isCampaign,
        botIndex: action.isCampaign ? action.botIndex! : null,
        matchOver: false,
        winnerIndex: null,
        roundsWon: [0, 0],
        roundNum: 1,
        matchStats: [
          { blackjacks: 0, busts: 0, doubles: 0, splits: 0, ironWillSaves: 0, usedComeback: false },
          { blackjacks: 0, busts: 0, doubles: 0, splits: 0, ironWillSaves: 0, usedComeback: false },
        ],
        lastResult: null,
        round: 1,
        phase: "betting",
        pendingBets: [null, null],
        bets: null,
        hands: null,
        pending: [[null], [null]],
        deck: [],
      });
    }
    case "BET": {
      if (!state || state.phase !== "betting") return state!;
      if (state.pendingBets[action.player] != null) return state;
      const player = state.players[action.player];
      const tier = action.amount > 0 && player.chips >= 1 ? 1 : 0;
      const pendingBets: [number | null, number | null] = [...state.pendingBets];
      pendingBets[action.player] = tier;
      return resolveBetsIfReady(state, pendingBets);
    }
    case "CHOOSE": {
      if (!state || state.phase !== "action" || !state.hands) return state!;
      const { player, subIndex, choice } = action;
      const sub = state.hands[player][subIndex];
      if (!sub || sub.done) return state;
      if (state.pending[player][subIndex] != null) return state;
      if (choice === "double" && sub.cards.length !== 2) return state;
      if (choice === "split" && (state.hands[player].length !== 1 || !canSplitCards(sub.cards))) return state;

      const pending: [Array<string | null>, Array<string | null>] = [
        [...state.pending[0]],
        [...state.pending[1]],
      ];
      pending[player][subIndex] = choice;

      const stillWaiting = [0, 1].some((p) =>
        state.hands![p as 0 | 1].some((h, s) => !h.done && pending[p][s] == null)
      );
      if (stillWaiting) return { ...state, pending };

      const deck = [...state.deck];
      const hands = state.hands.map((subs, p) => {
        if (subs.length === 1 && pending[p][0] === "split") {
          const s = subs[0];
          const cardA = deck.pop()!;
          const cardB = deck.pop()!;
          const mk = (cards: Card[]): SubHand => ({
            cards,
            done: isNaturalBlackjack(cards),
            busted: false,
            doubled: false,
            split: true,
          });
          return [mk([s.cards[0], cardA]), mk([s.cards[1], cardB])];
        }
        return subs.map((h, s) => {
          if (h.done) return h;
          const c = pending[p][s];
          if (c === "hit") {
            const card = deck.pop()!;
            const cards = [...h.cards, card];
            const val = computeHandValue(cards);
            return { ...h, cards, done: val.total > 21, busted: val.total > 21 };
          }
          if (c === "double") {
            const card = deck.pop()!;
            const cards = [...h.cards, card];
            const val = computeHandValue(cards);
            return { ...h, cards, done: true, busted: val.total > 21, doubled: true };
          }
          return { ...h, done: true };
        });
      }) as [SubHand[], SubHand[]];
      const phase: Phase = hands[0].every((h) => h.done) && hands[1].every((h) => h.done) ? "readyToResolve" : "action";
      const nextPending: [Array<string | null>, Array<string | null>] = [hands[0].map(() => null), hands[1].map(() => null)];
      return { ...state, deck, hands, pending: nextPending, phase };
    }
    case "RESOLVE_ROUND": {
      if (!state || !state.hands) return state!;
      const statsA = effectiveStats(state.players[0]);
      const statsB = effectiveStats(state.players[1]);
      const betA = state.bets ? state.bets[0] : 1;
      const betB = state.bets ? state.bets[1] : 1;

      const pairs = pairSubhands(state.hands[0], state.hands[1]);
      let dmgToA = 0;
      let dmgToB = 0;
      let bjWinsA = 0;
      let bjWinsB = 0;
      const pairResults: PairResult[] = [];

      for (const [ha, hb] of pairs) {
        const r = resolveRound(ha.cards, hb.cards, statsA, statsB);
        let da = r.dmgToA;
        let db = r.dmgToB;
        if (r.outcome === "aWins") {
          db = Math.round(db * Math.min(4, betA * (ha.doubled ? 2 : 1)));
          if (r.aBJ) bjWinsA += 1;
        } else if (r.outcome === "bWins") {
          da = Math.round(da * Math.min(4, betB * (hb.doubled ? 2 : 1)));
          if (r.bBJ) bjWinsB += 1;
        }
        if (ha.doubled && r.outcome !== "aWins") da = Math.round(da * 2);
        if (hb.doubled && r.outcome !== "bWins") db = Math.round(db * 2);

        da = Math.min(PAIR_DAMAGE_CAP, da);
        db = Math.min(PAIR_DAMAGE_CAP, db);
        dmgToA += da;
        dmgToB += db;
        pairResults.push({ ...r, dmgToA: da, dmgToB: db, doubledA: !!ha.doubled, doubledB: !!hb.doubled });
      }

      const chipsA = state.players[0].chips;
      const chipsB = state.players[1].chips;

      const ironWillTriggered: [boolean, boolean] = [false, false];
      const players = state.players.map((p, i) => {
        const dmg = i === 0 ? dmgToA : dmgToB;
        let hp = p.hp - dmg;
        let ironWillUsed = p.ironWillUsed;
        if (hp <= 0 && p.ironWill && !p.ironWillUsed) {
          hp = 1;
          ironWillUsed = true;
          ironWillTriggered[i] = true;
        } else {
          hp = Math.max(0, hp);
        }
        return {
          ...p,
          hp,
          ironWillUsed,
          chips: i === 0 ? chipsA : chipsB,
          bjWins: (p.bjWins || 0) + (i === 0 ? bjWinsA : bjWinsB),
        };
      }) as [Player, Player];

      const matchStats = state.matchStats.map((ms, i) => {
        const subs = state.hands![i as 0 | 1];
        return {
          blackjacks: ms.blackjacks + subs.filter((h) => isNaturalBlackjack(h.cards)).length,
          busts: ms.busts + subs.filter((h) => h.busted).length,
          doubles: ms.doubles + subs.filter((h) => h.doubled).length,
          splits: ms.splits + (subs.length === 2 ? 1 : 0),
          ironWillSaves: ms.ironWillSaves + (ironWillTriggered[i] ? 1 : 0),
          usedComeback: ms.usedComeback || state.players[i].hp <= (state.players[i].comebackThreshold || UNDERDOG_HP),
        };
      }) as [MatchStat, MatchStat];

      let battleOver = false;
      let battleWinnerIndex: number | null = null;
      if (players[0].hp <= 0 || players[1].hp <= 0) {
        battleOver = true;
        if (players[0].hp <= 0 && players[1].hp <= 0) {
          battleWinnerIndex = players[0].hp === players[1].hp ? -1 : players[0].hp > players[1].hp ? 0 : 1;
        } else {
          battleWinnerIndex = players[0].hp <= 0 ? 1 : 0;
        }
      }

      let roundsWon = state.roundsWon;
      let matchOver = false;
      let winnerIndex: number | null = null;
      if (battleOver) {
        if (battleWinnerIndex === -1) {
          matchOver = true;
          winnerIndex = -1;
        } else {
          roundsWon = [...state.roundsWon] as [number, number];
          roundsWon[battleWinnerIndex!] += 1;
          if (roundsWon[battleWinnerIndex!] >= ROUNDS_TO_WIN) {
            matchOver = true;
            winnerIndex = battleWinnerIndex;
          }
        }
      }

      const lastResult: LastResult = {
        pairs: pairResults,
        dmgToA,
        dmgToB,
        betA,
        betB,
        aBJ: pairResults.some((pr) => pr.aBJ),
        bBJ: pairResults.some((pr) => pr.bBJ),
        splitA: state.hands[0].length === 2,
        splitB: state.hands[1].length === 2,
        ironWillA: ironWillTriggered[0],
        ironWillB: ironWillTriggered[1],
        comebackA: state.players[0].hp <= (state.players[0].comebackThreshold || UNDERDOG_HP),
        comebackB: state.players[1].hp <= (state.players[1].comebackThreshold || UNDERDOG_HP),
        battleOver,
        battleWinnerIndex,
        roundsWon,
      };
      return {
        ...state,
        players,
        roundsWon,
        matchStats,
        lastResult,
        phase: matchOver ? "finisher" : battleOver ? "roundOver" : "roundResult",
        matchOver,
        winnerIndex,
      };
    }
    case "ADVANCE": {
      if (!state || state.matchOver || state.phase !== "roundResult") return state!;
      return autoSkipZeroChipBets({
        ...state,
        phase: "betting",
        round: state.round + 1,
        hands: null,
        pending: [[null], [null]],
        pendingBets: [null, null],
        bets: null,
        lastResult: null,
      });
    }
    case "NEXT_BATTLE": {
      if (!state || state.matchOver || state.phase !== "roundOver") return state!;
      const players = state.players.map((p) => ({
        ...p,
        hp: p.maxHp,
        chips: p.baseChips,
        ironWillUsed: false,
      })) as [Player, Player];
      return autoSkipZeroChipBets({
        ...state,
        players,
        roundNum: state.roundNum + 1,
        round: 1,
        phase: "betting",
        hands: null,
        pending: [[null], [null]],
        pendingBets: [null, null],
        bets: null,
        lastResult: null,
      });
    }
    case "FORFEIT": {
      if (!state || state.matchOver) return state!;
      const winnerIndex = action.player === 0 ? 1 : 0;
      return { ...state, matchOver: true, winnerIndex, phase: "finisher" };
    }
    case "FINISH":
      if (!state) return state!;
      return { ...state, phase: "matchEnd" };
    default:
      return state!;
  }
}

// Applies every deterministic auto-transition that doesn't need a human
// decision (readyToResolve -> RESOLVE_ROUND). Pacing/suspense ("onthullen...")
// is purely a client-side animation on top of this — the server always
// settles instantly to the next real decision point or a terminal phase.
export function settle(state: MatchState): MatchState {
  let s = state;
  let guard = 0;
  while (s.phase === "readyToResolve" && guard++ < 10) {
    s = matchReducer(s, { type: "RESOLVE_ROUND" });
  }
  return s;
}

// If it's the bot's turn (player 1) in a campaign match, compute and apply
// its decision(s) — repeatedly, since one action can open up the next.
export function playBotTurns(state: MatchState): MatchState {
  if (!state.isCampaign || state.botIndex == null) return state;
  const botIndex = state.botIndex;
  let s = state;
  let guard = 0;
  while (!s.matchOver && guard++ < 20) {
    if (s.phase === "betting" && s.pendingBets[1] == null) {
      const bot = BOTS[botIndex];
      s = matchReducer(s, { type: "BET", player: 1, amount: botDecideBet(bot.ai, s.players[1].chips) });
      s = settle(s);
      continue;
    }
    if (s.phase === "action" && s.hands) {
      const subs = s.hands[1];
      const idx = subs.findIndex((h, si) => !h.done && s.pending[1][si] == null);
      if (idx === -1) break;
      const bot = BOTS[botIndex];
      const oppSubs = s.hands[0];
      let oppBest: number | null = null;
      for (const h of oppSubs) {
        if (h.busted) continue;
        const v = computeHandValue(h.cards).total;
        if (oppBest == null || v > oppBest) oppBest = v;
      }
      const canSplitNow = subs.length === 1 && canSplitCards(subs[idx].cards);
      const choice = botDecideAction(bot.ai, subs[idx], canSplitNow, oppBest) as "hit" | "stand" | "double" | "split";
      s = matchReducer(s, { type: "CHOOSE", player: 1, subIndex: idx, choice });
      s = settle(s);
      continue;
    }
    break;
  }
  return s;
}
