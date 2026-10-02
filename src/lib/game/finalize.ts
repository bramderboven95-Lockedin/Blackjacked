import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { MatchState } from "./reducer";
import { checkAchievements, glicko2Match, ACHIEVEMENTS, BOTS } from "./engine";

// Called once, right when `state.matchOver` first becomes true for a match
// row that isn't finalized yet. Idempotent by design: the caller checks
// `matches.finalized` first and this function sets it, so a race between two
// requests (both players' clients triggering the same resolve) can only ever
// apply the result once — see the `.eq("finalized", false)` guard below.
export async function finalizeMatch(matchId: string, state: MatchState) {
  const admin = createAdminClient();

  const { data: match } = await admin.from("matches").select("player_a, player_b, is_campaign, bot_index, finalized").eq("id", matchId).single();
  if (!match || match.finalized) return;

  if (match.is_campaign) {
    await finalizeCampaign(admin, matchId, match, state);
  } else {
    await finalizePvp(admin, matchId, match, state);
  }
}

async function finalizePvp(admin: ReturnType<typeof createAdminClient>, matchId: string, match: any, state: MatchState) {
  const [{ data: pa }, { data: pb }] = await Promise.all([
    admin.from("profiles").select("*").eq("id", match.player_a).single(),
    admin.from("profiles").select("*").eq("id", match.player_b).single(),
  ]);
  if (!pa || !pb) return;

  const winnerIndex = state.winnerIndex;
  let ratingA = { rating: pa.rating, rd: pa.rd, vol: pa.vol };
  let ratingB = { rating: pb.rating, rd: pb.rd, vol: pb.vol };
  const updates: Record<string, any>[] = [
    { ...pa, matches_played: pa.matches_played + 1 },
    { ...pb, matches_played: pb.matches_played + 1 },
  ];

  if (winnerIndex !== -1 && winnerIndex !== null) {
    const scoreA = winnerIndex === 0 ? 1 : 0;
    const [newA, newB] = glicko2Match(ratingA, ratingB, scoreA);
    updates[0].rating = newA.rating;
    updates[0].rd = newA.rd;
    updates[0].vol = newA.vol;
    updates[1].rating = newB.rating;
    updates[1].rd = newB.rd;
    updates[1].vol = newB.vol;
    if (winnerIndex === 0) {
      updates[0].wins = pa.wins + 1;
      updates[0].streak = pa.streak + 1;
      updates[0].best_streak = Math.max(pa.best_streak, pa.streak + 1);
      updates[1].losses = pb.losses + 1;
      updates[1].streak = 0;
    } else {
      updates[1].wins = pb.wins + 1;
      updates[1].streak = pb.streak + 1;
      updates[1].best_streak = Math.max(pb.best_streak, pb.streak + 1);
      updates[0].losses = pa.losses + 1;
      updates[0].streak = 0;
    }
  }

  const tokensA = (winnerIndex === -1 || winnerIndex === null ? 2 : winnerIndex === 0 ? 4 : 2) + (state.players[0].bjWins || 0);
  const tokensB = (winnerIndex === -1 || winnerIndex === null ? 2 : winnerIndex === 1 ? 4 : 2) + (state.players[1].bjWins || 0);
  updates[0].tokens = pa.tokens + tokensA;
  updates[0].tokens_earned_total = pa.tokens_earned_total + tokensA;
  updates[1].tokens = pb.tokens + tokensB;
  updates[1].tokens_earned_total = pb.tokens_earned_total + tokensB;

  const msA = state.matchStats[0];
  const msB = state.matchStats[1];
  updates[0].stats = mergeStats(pa.stats, msA, winnerIndex === 0);
  updates[1].stats = mergeStats(pb.stats, msB, winnerIndex === 1);

  const newAchA = checkAchievements(toAchInput(updates[0]));
  const newAchB = checkAchievements(toAchInput(updates[1]));
  updates[0].achievements = [...pa.achievements, ...newAchA];
  updates[1].achievements = [...pb.achievements, ...newAchB];

  await Promise.all([
    admin
      .from("profiles")
      .update(stripId(updates[0]))
      .eq("id", pa.id),
    admin
      .from("profiles")
      .update(stripId(updates[1]))
      .eq("id", pb.id),
    admin.from("matches").update({ finalized: true, winner: winnerIndex === 0 ? pa.id : winnerIndex === 1 ? pb.id : null }).eq("id", matchId).eq("finalized", false),
  ]);

  const notifs = [
    {
      user_id: pa.id,
      type: "match_result",
      payload: { won: winnerIndex === 0, opponent: pb.username },
    },
    {
      user_id: pb.id,
      type: "match_result",
      payload: { won: winnerIndex === 1, opponent: pa.username },
    },
    ...newAchA.map((id) => ({ user_id: pa.id, type: "achievement", payload: { name: ACHIEVEMENTS.find((a) => a.id === id)?.name } })),
    ...newAchB.map((id) => ({ user_id: pb.id, type: "achievement", payload: { name: ACHIEVEMENTS.find((a) => a.id === id)?.name } })),
  ];
  await admin.from("notifications").insert(notifs);
}

async function finalizeCampaign(admin: ReturnType<typeof createAdminClient>, matchId: string, match: any, state: MatchState) {
  const { data: p } = await admin.from("profiles").select("*").eq("id", match.player_a).single();
  if (!p) return;

  const botIndex = match.bot_index ?? 0;
  const won = state.winnerIndex === 0;
  let tokensEarned = 0;
  let newPos = p.campaign_pos;
  let campaignWins = p.campaign_wins;

  if (won) {
    tokensEarned = botIndex + 1;
    newPos = Math.min(BOTS.length - 1, botIndex + 1);
    campaignWins = p.campaign_wins + 1;
  } else if (state.winnerIndex === 1) {
    newPos = Math.max(0, botIndex - 1);
  }

  const ms = state.matchStats[0];
  const update: Record<string, any> = {
    matches_played: p.matches_played + 1,
    tokens: p.tokens + tokensEarned,
    tokens_earned_total: p.tokens_earned_total + tokensEarned,
    campaign_pos: newPos,
    campaign_wins: campaignWins,
    stats: mergeStats(p.stats, ms, won),
  };

  const newAch = checkAchievements(toAchInput({ ...p, ...update }));
  update.achievements = [...p.achievements, ...newAch];

  await Promise.all([
    admin.from("profiles").update(update).eq("id", p.id),
    admin
      .from("matches")
      .update({ finalized: true, winner: won ? p.id : null })
      .eq("id", matchId)
      .eq("finalized", false),
  ]);

  await admin.from("notifications").insert([
    {
      user_id: p.id,
      type: "match_result",
      payload: { won, opponent: BOTS[botIndex].name },
    },
    ...newAch.map((id) => ({ user_id: p.id, type: "achievement", payload: { name: ACHIEVEMENTS.find((a) => a.id === id)?.name } })),
  ]);
}

function mergeStats(base: any, ms: MatchState["matchStats"][number], won: boolean) {
  return {
    blackjacks: (base?.blackjacks || 0) + ms.blackjacks,
    busts: (base?.busts || 0) + ms.busts,
    doubles: (base?.doubles || 0) + ms.doubles,
    splits: (base?.splits || 0) + ms.splits,
    kos: (base?.kos || 0) + (won ? 1 : 0),
    comebackWins: (base?.comebackWins || 0) + (won && ms.usedComeback ? 1 : 0),
    ironWillSaves: (base?.ironWillSaves || 0) + ms.ironWillSaves,
  };
}
function toAchInput(u: any) {
  return {
    wins: u.wins ?? 0,
    bestStreak: u.best_streak ?? 0,
    matches_played: u.matches_played ?? 0,
    rating: u.rating ?? 1500,
    campaign_pos: u.campaign_pos ?? 0,
    campaign_wins: u.campaign_wins ?? 0,
    perks: [...new Set([...(u.perks ?? []), ...Object.keys(u.relic_levels ?? {}).filter(k => Number(u.relic_levels[k]) > 0)])],
    tokens_earned_total: u.tokens_earned_total ?? 0,
    achievements: u.achievements ?? [],
    stats: u.stats ?? { blackjacks: 0, busts: 0, doubles: 0, splits: 0, kos: 0, comebackWins: 0, ironWillSaves: 0 },
  };
}
function stripId(u: Record<string, any>) {
  const { id, created_at, ...rest } = u;
  return rest;
}
