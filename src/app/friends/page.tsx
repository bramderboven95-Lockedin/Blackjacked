"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RankBadge from "@/components/RankBadge";
import TabBar from "@/components/TabBar";

type Profile = { id: string; username: string; rating: number };
type Friendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  requester: Profile | null;
  addressee: Profile | null;
};
type Challenge = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: string;
  match_id: string | null;
  challenger: Profile | null;
  opponent: Profile | null;
};

export default function FriendsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);

    const { data: fs } = await supabase
      .from("friendships")
      .select("id, requester_id, addressee_id, status, requester:requester_id(id,username,rating), addressee:addressee_id(id,username,rating)")
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    setFriendships((fs as any) || []);

    const { data: cs } = await supabase
      .from("challenges")
      .select(
        "id, challenger_id, opponent_id, status, match_id, challenger:challenger_id(id,username,rating), opponent:opponent_id(id,username,rating)"
      )
      .or(`challenger_id.eq.${user.id},opponent_id.eq.${user.id}`)
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false });
    setChallenges((cs as any) || []);
  }, [supabase]);

  useEffect(() => {
    load();
    const channel = supabase
      .channel("friends-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "challenges" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  async function search() {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const { data } = await supabase
      .from("profiles")
      .select("id, username, rating")
      .ilike("username", `%${query.trim()}%`)
      .limit(10);
    setResults((data || []).filter((p) => p.id !== userId));
  }

  async function call(url: string, body: any) {
    setBusy(url + JSON.stringify(body));
    setMessage("");
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) {
      setMessage(json.error || "Er ging iets mis.");
    } else {
      load();
    }
    return json;
  }

  const friends = friendships.filter((f) => f.status === "accepted");
  const incoming = friendships.filter((f) => f.status === "pending" && f.addressee_id === userId);
  const outgoing = friendships.filter((f) => f.status === "pending" && f.requester_id === userId);
  const incomingChallenges = challenges.filter((c) => c.status === "pending" && c.opponent_id === userId);
  const outgoingChallenges = challenges.filter((c) => c.status === "pending" && c.challenger_id === userId);
  const acceptedChallenges = challenges.filter((c) => c.status === "accepted" && c.match_id);

  function otherOf(f: Friendship): Profile | null {
    return f.requester_id === userId ? f.addressee : f.requester;
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto flex flex-col gap-4">
      <h1 className="font-display text-2xl text-goldbright">Vrienden</h1>

      <div className="panel">
        <h2 className="font-display text-lg text-gold mb-2">Speler zoeken</h2>
        <div className="flex gap-2">
          <input
            className="input flex-1"
            placeholder="Gebruikersnaam"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
          <button className="btn-ghost" onClick={search}>
            Zoek
          </button>
        </div>
        {results.length > 0 && (
          <div className="flex flex-col gap-1 mt-3">
            {results.map((p) => (
              <div key={p.id} className="flex items-center justify-between bg-bgalt rounded-lg px-3 py-2 text-sm">
                <span className="font-semibold">{p.username}</span>
                <button
                  className="btn-ghost !py-1.5 !px-3 !text-xs"
                  disabled={busy === "/api/friends/request" + JSON.stringify({ targetUsername: p.username })}
                  onClick={() => call("/api/friends/request", { targetUsername: p.username })}
                >
                  + Vriend
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {message && <p className="text-red text-sm">{message}</p>}

      {(incomingChallenges.length > 0 || acceptedChallenges.length > 0) && (
        <div className="panel border-gold">
          <h2 className="font-display text-lg text-gold mb-2">Uitdagingen</h2>
          <div className="flex flex-col gap-2">
            {incomingChallenges.map((c) => (
              <div key={c.id} className="flex items-center justify-between bg-bgalt rounded-lg px-3 py-2 text-sm">
                <span>
                  <b>{c.challenger?.username}</b> daagt je uit
                </span>
                <div className="flex gap-1.5">
                  <button className="btn-primary !py-1.5 !px-3 !text-xs" onClick={() => call("/api/challenges/respond", { challengeId: c.id, accept: true })}>
                    Accepteer
                  </button>
                  <button className="btn-ghost !py-1.5 !px-3 !text-xs" onClick={() => call("/api/challenges/respond", { challengeId: c.id, accept: false })}>
                    Weiger
                  </button>
                </div>
              </div>
            ))}
            {acceptedChallenges.map((c) => (
              <button
                key={c.id}
                onClick={() => router.push(`/match/${c.match_id}`)}
                className="flex items-center justify-between bg-bgalt rounded-lg px-3 py-2 text-sm w-full text-left"
              >
                <span>
                  Live tegen <b>{c.challenger_id === userId ? c.opponent?.username : c.challenger?.username}</b>
                </span>
                <span className="text-teal underline text-xs">Speel verder</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h2 className="font-display text-lg text-gold mb-2">
          Vrienden {friends.length > 0 && <span className="text-dim text-sm">({friends.length})</span>}
        </h2>
        {friends.length === 0 ? (
          <p className="text-dim text-sm">Nog geen vrienden. Zoek hierboven een speler op.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {friends.map((f) => {
              const other = otherOf(f);
              if (!other) return null;
              const alreadyChallenged = outgoingChallenges.some((c) => c.opponent_id === other.id);
              return (
                <div key={f.id} className="flex items-center justify-between bg-bgalt rounded-lg px-3 py-2 text-sm gap-2">
                  <span className="font-semibold flex-1 truncate">{other.username}</span>
                  <RankBadge rating={other.rating} small />
                  <button
                    className="btn-ghost !py-1.5 !px-3 !text-xs"
                    disabled={alreadyChallenged}
                    onClick={() => call("/api/challenges/create", { opponentId: other.id })}
                  >
                    {alreadyChallenged ? "Uitgedaagd" : "Daag uit"}
                  </button>
                  <button className="text-dim text-xs underline" onClick={() => call("/api/friends/remove", { friendshipId: f.id })}>
                    Verwijder
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {incoming.length > 0 && (
        <div className="panel">
          <h2 className="font-display text-lg text-gold mb-2">Vriendschapsverzoeken</h2>
          <div className="flex flex-col gap-1">
            {incoming.map((f) => {
              const other = otherOf(f);
              return (
                <div key={f.id} className="flex items-center justify-between bg-bgalt rounded-lg px-3 py-2 text-sm">
                  <span className="font-semibold">{other?.username}</span>
                  <div className="flex gap-1.5">
                    <button className="btn-primary !py-1.5 !px-3 !text-xs" onClick={() => call("/api/friends/respond", { friendshipId: f.id, accept: true })}>
                      Accepteer
                    </button>
                    <button className="btn-ghost !py-1.5 !px-3 !text-xs" onClick={() => call("/api/friends/respond", { friendshipId: f.id, accept: false })}>
                      Weiger
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div className="panel">
          <h2 className="font-display text-lg text-gold mb-2">Verstuurde verzoeken</h2>
          <div className="flex flex-col gap-1">
            {outgoing.map((f) => {
              const other = otherOf(f);
              return (
                <div key={f.id} className="flex items-center justify-between bg-bgalt rounded-lg px-3 py-2 text-sm">
                  <span className="text-dim">{other?.username}</span>
                  <button className="text-dim text-xs underline" onClick={() => call("/api/friends/remove", { friendshipId: f.id })}>
                    Annuleer
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <TabBar />
    </main>
  );
}
