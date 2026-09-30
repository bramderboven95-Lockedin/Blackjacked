import { getOwnProfile } from "@/lib/profile";
import RankBadge from "@/components/RankBadge";
import TabBar from "@/components/TabBar";
import { ACHIEVEMENTS, BOTS, getRank } from "@/lib/game/engine";

export const revalidate = 0;

export default async function ProfilePage() {
  const { supabase, user, profile } = await getOwnProfile();

  const { data: matches } = await supabase
    .from("matches")
    .select("id, player_a, player_b, is_campaign, bot_index, winner, state, updated_at, finalized")
    .or(`player_a.eq.${user.id},player_b.eq.${user.id}`)
    .eq("finalized", true)
    .order("updated_at", { ascending: false })
    .limit(10);

  const opponentIds = Array.from(
    new Set((matches || []).map((m) => (m.player_a === user.id ? m.player_b : m.player_a)).filter(Boolean))
  ) as string[];
  const { data: opponents } =
    opponentIds.length > 0 ? await supabase.from("profiles").select("id, username").in("id", opponentIds) : { data: [] };
  const opponentMap = new Map((opponents || []).map((o) => [o.id, o.username]));

  const rank = getRank(profile.rating);
  const achievements: string[] = profile.achievements || [];
  const stats = profile.stats || {};

  return (
    <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto flex flex-col gap-4">
      <div className="panel">
        <div className="flex items-start justify-between mb-3.5">
          <div>
            <div className="font-display text-2xl tracking-wide">{profile.username}</div>
            <RankBadge rating={profile.rating} />
          </div>
          <div className="font-display text-3xl" style={{ color: rank.color }}>
            {Math.round(profile.rating)}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-2">
          <StatBox label="Winst" value={profile.wins} />
          <StatBox label="Verlies" value={profile.losses} />
          <StatBox label="Beste streak" value={profile.best_streak} />
          <StatBox label="Blackjacks" value={stats.blackjacks || 0} />
        </div>
      </div>

      <div className="panel">
        <h2 className="font-display text-lg text-gold mb-2">Recente matches</h2>
        {(matches || []).length === 0 ? (
          <p className="text-dim text-sm text-center py-4">Nog geen matches gespeeld.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {(matches || []).map((m) => {
              const won = m.winner === user.id;
              const isDraw = !m.winner;
              const opponentName = m.is_campaign
                ? BOTS[m.bot_index ?? 0]?.name || "Bot"
                : opponentMap.get(m.player_a === user.id ? m.player_b! : m.player_a) || "Onbekend";
              const roundsWon = m.state?.roundsWon;
              return (
                <div key={m.id} className="flex items-center gap-2.5 bg-bgalt rounded-lg px-3 py-2 text-sm">
                  <span
                    className={`w-5 h-5 rounded flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${
                      isDraw ? "bg-line text-dim" : won ? "bg-[#4C8C5B40] text-[#7BC98C]" : "bg-[#B33B3B38] text-[#E58A82]"
                    }`}
                  >
                    {isDraw ? "D" : won ? "W" : "L"}
                  </span>
                  <span className="flex-1 font-semibold truncate">
                    {opponentName}
                    {m.is_campaign && <span className="text-xs ml-1">{"\u{1F916}"}</span>}
                  </span>
                  {roundsWon && (
                    <span className="text-dim text-xs">
                      {roundsWon[0]}&ndash;{roundsWon[1]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="panel">
        <h2 className="font-display text-lg text-gold mb-1">Badges</h2>
        <p className="text-dim text-xs mb-3">
          {achievements.length} / {ACHIEVEMENTS.length} behaald
        </p>
        <div className="grid grid-cols-3 gap-2">
          {ACHIEVEMENTS.map((a) => {
            const has = achievements.includes(a.id);
            return (
              <div
                key={a.id}
                title={a.desc}
                className={`flex flex-col items-center gap-1 rounded-lg p-2.5 text-center border ${
                  has ? "border-gold bg-gold/10 opacity-100" : "border-line opacity-40"
                } bg-bgalt`}
              >
                <span className="text-xl leading-none">{has ? a.icon : "\u{1F512}"}</span>
                <span className="text-[10px] font-semibold leading-tight">{a.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      <form action="/auth/signout" method="post">
        <button className="btn-ghost w-full" type="submit">
          Uitloggen
        </button>
      </form>

      <TabBar />
    </main>
  );
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 bg-bgalt border border-line rounded-lg py-2.5 text-center">
      <span className="font-display text-xl">{value}</span>
      <span className="text-dim text-[10px]">{label}</span>
    </div>
  );
}
