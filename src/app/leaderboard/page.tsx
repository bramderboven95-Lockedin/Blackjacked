import { getOwnProfile } from "@/lib/profile";
import RankBadge from "@/components/RankBadge";
import TabBar from "@/components/TabBar";

export const revalidate = 0;

export default async function LeaderboardPage() {
  const { supabase, user } = await getOwnProfile();
  const { data: players } = await supabase
    .from("profiles")
    .select("id, username, rating, wins, losses, streak")
    .order("rating", { ascending: false })
    .limit(100);

  return (
    <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto flex flex-col gap-4">
      <h1 className="font-display text-2xl text-goldbright">Klassement</h1>
      <div className="panel !p-2">
        {(players || []).length === 0 ? (
          <p className="text-dim text-sm text-center py-6">Nog geen gerangschikte spelers.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {(players || []).map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  p.id === user.id ? "bg-gold/15 border border-gold" : "bg-bgalt"
                }`}
              >
                <span className="w-6 text-center text-gold font-bold">{i === 0 ? "\u{1F451}" : i + 1}</span>
                <span className="flex-1 font-semibold truncate">{p.username}</span>
                <RankBadge rating={p.rating} small />
                <span className="text-goldbright font-bold w-12 text-right">{Math.round(p.rating)}</span>
                <span className="text-dim w-16 text-right">
                  {p.wins}W&ndash;{p.losses}L
                </span>
                {p.streak >= 3 && <span className="text-[#E0883A] text-xs">{"\u{1F525}"}{p.streak}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      <TabBar />
    </main>
  );
}
