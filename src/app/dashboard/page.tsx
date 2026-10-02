import Link from "next/link";
import { getOwnProfile } from "@/lib/profile";
import { createAdminClient } from "@/lib/supabase/admin";
import RankBadge from "@/components/RankBadge";
import TabBar from "@/components/TabBar";
import NotificationBell from "@/components/NotificationBell";
import { BOTS } from "@/lib/game/engine";

export default async function DashboardPage() {
  const { user, profile } = await getOwnProfile();
  const admin = createAdminClient();

  const { data: pendingChallenges } = await admin
    .from("challenges")
    .select("id, challenger_id, created_at, profiles!challenges_challenger_id_fkey(username, rating)")
    .eq("opponent_id", user.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  const { data: topPlayers } = await admin
    .from("profiles")
    .select("id, username, rating, wins, losses")
    .order("rating", { ascending: false })
    .limit(5);

  const nextBot = BOTS[Math.min(profile.campaign_pos, BOTS.length - 1)];

  return (
    <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl text-goldbright tracking-wide">BLACKJACKED</h1>
        <NotificationBell userId={user.id} />
      </div>

      <div className="panel flex items-center justify-between">
        <div>
          <div className="font-display text-xl">{profile.username}</div>
          <RankBadge rating={profile.rating} />
        </div>
        <div className="text-right">
          <div className="font-display text-3xl text-goldbright">{Math.round(profile.rating)}</div>
          <div className="text-dim text-xs">
            {profile.wins}W&ndash;{profile.losses}L
          </div>
        </div>
      </div>

      {pendingChallenges && pendingChallenges.length > 0 && (
        <div className="panel border-gold">
          <h2 className="font-display text-lg text-gold mb-2">Uitdagingen</h2>
          <div className="flex flex-col gap-2">
            {pendingChallenges.map((c: any) => (
              <div key={c.id} className="flex items-center justify-between bg-bgalt rounded-lg px-3 py-2 text-sm">
                <span>
                  <b>{c.profiles?.username}</b> <span className="text-dim">({Math.round(c.profiles?.rating)})</span>
                </span>
                <Link href="/friends" className="text-teal underline text-xs">
                  Bekijk
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h2 className="font-display text-lg text-gold mb-2">Campaign</h2>
        <p className="text-sm text-dim mb-3">
          Volgende tegenstander: <b className="text-text">{nextBot.name}</b>
        </p>
        <Link href="/campaign" className="btn-primary block text-center">
          SPEEL TEGEN BOT
        </Link>
      </div>

      <div className="panel flex flex-col gap-2">
        <h2 className="font-display text-lg text-gold">🎲 Random Challenger</h2>
        <p className="text-sm text-dim">Neem het op tegen een willekeurige bot met eigen ATK, DEF, HP en Glicko-rating.</p>
        <Link href="/challenger" className="btn-primary text-center">RANDOM CHALLENGER</Link>
      </div>
      <div className="panel flex flex-col gap-2">
        <h2 className="font-display text-lg text-gold">🎯 Missions & Rewards</h2>
        <p className="text-sm text-dim">Dagelijkse missies, wekelijkse uitdagingen, achievements en Campaign-beloningen.</p>
        <Link href="/rewards" className="btn-ghost text-center">BEKIJK BELONINGEN</Link>
      </div>

      <div className="panel">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-display text-lg text-gold">Top 5</h2>
          <Link href="/leaderboard" className="text-teal underline text-xs">
            Volledig klassement
          </Link>
        </div>
        <div className="flex flex-col gap-1">
          {(topPlayers || []).map((p: any, i: number) => (
            <div key={p.id} className="flex items-center gap-2 bg-bgalt rounded-lg px-3 py-2 text-sm">
              <span className="w-5 text-gold font-bold">{i === 0 ? "\u{1F451}" : i + 1}</span>
              <span className="flex-1 font-semibold truncate">{p.username}</span>
              <span className="text-goldbright font-bold">{Math.round(p.rating)}</span>
            </div>
          ))}
        </div>
      </div>

      <Link href="/friends" className="btn-ghost text-center">
        Daag een vriend uit
      </Link>

      <TabBar />
    </main>
  );
}
