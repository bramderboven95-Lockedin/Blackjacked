
"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import RankBadge from "@/components/RankBadge";
import TabBar from "@/components/TabBar";

type Profile = {
  id: string;
  username: string;
  rating: number;
};

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
  const [searchLoading, setSearchLoading] = useState(true);
  const [searchError, setSearchError] = useState("");

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Laad de ingelogde gebruiker, vrienden en uitdagingen.
  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    setUserId(user.id);

    const { data: fs } = await supabase
      .from("friendships")
      .select(
        "id, requester_id, addressee_id, status, requester:requester_id(id,username,rating), addressee:addressee_id(id,username,rating)"
      )
      .or(
        `requester_id.eq.${user.id},addressee_id.eq.${user.id}`
      );

    setFriendships((fs as unknown as Friendship[]) || []);

    const { data: cs } = await supabase
      .from("challenges")
      .select(
        "id, challenger_id, opponent_id, status, match_id, challenger:challenger_id(id,username,rating), opponent:opponent_id(id,username,rating)"
      )
      .or(
        `challenger_id.eq.${user.id},opponent_id.eq.${user.id}`
      )
      .in("status", ["pending", "accepted"])
      .order("created_at", { ascending: false });

    setChallenges((cs as unknown as Challenge[]) || []);
  }, [supabase]);

  // Laad gegevens en luister naar realtime wijzigingen.
  useEffect(() => {
    load();

    const channel = supabase
      .channel("friends-page")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "friendships",
        },
        load
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "challenges",
        },
        load
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, load]);

  // Toon automatisch de eerste 20 geregistreerde spelers.
  // Wanneer iemand typt, wordt de lijst live gefilterd.
  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    const timer = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");

      let request = supabase
        .from("profiles")
        .select("id, username, rating")
        .order("username", { ascending: true })
        .limit(21);

      if (query.trim()) {
        request = request.ilike(
          "username",
          `%${query.trim()}%`
        );
      }

      const { data, error } = await request;

      if (cancelled) return;

      if (error) {
        setResults([]);
        setSearchError(
          "Spelers konden niet geladen worden."
        );
      } else {
        const players = (data || [])
          .filter((p) => p.id !== userId)
          .slice(0, 20);

        setResults(players);
      }

      setSearchLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [supabase, userId, query]);

  // Bestaande API-aanroepen blijven behouden.
  async function call(url: string, body: any) {
    const busyKey = url + JSON.stringify(body);

    setBusy(busyKey);
    setMessage("");

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage(
          json.error || "Er ging iets mis."
        );
      } else {
        await load();
      }

      return json;
    } catch {
      setMessage(
        "Er kon geen verbinding gemaakt worden."
      );

      return null;
    } finally {
      setBusy(null);
    }
  }

  const friends = friendships.filter(
    (f) => f.status === "accepted"
  );

  const incoming = friendships.filter(
    (f) =>
      f.status === "pending" &&
      f.addressee_id === userId
  );

  const outgoing = friendships.filter(
    (f) =>
      f.status === "pending" &&
      f.requester_id === userId
  );

  const incomingChallenges = challenges.filter(
    (c) =>
      c.status === "pending" &&
      c.opponent_id === userId
  );

  const outgoingChallenges = challenges.filter(
    (c) =>
      c.status === "pending" &&
      c.challenger_id === userId
  );

  const acceptedChallenges = challenges.filter(
    (c) => c.status === "accepted" && c.match_id
  );

  function otherOf(f: Friendship): Profile | null {
    return f.requester_id === userId
      ? f.addressee
      : f.requester;
  }

  // Bepaal de vriendschapsstatus van een speler.
  function getFriendshipStatus(playerId: string) {
    const friendship = friendships.find(
      (f) =>
        f.requester_id === playerId ||
        f.addressee_id === playerId
    );

    if (!friendship) return "none";

    if (friendship.status === "accepted") {
      return "accepted";
    }

    if (friendship.status === "pending") {
      return friendship.requester_id === userId
        ? "outgoing"
        : "incoming";
    }

    return "none";
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto flex flex-col gap-4">

      <h1 className="font-display text-2xl text-goldbright">
        Vrienden
      </h1>

      {/* ALLE GEREGISTREERDE SPELERS */}

      <div className="panel">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg text-gold">
            Ontdek spelers
          </h2>

          <span className="text-dim text-xs">
            Max. 20 spelers
          </span>
        </div>

        <input
          className="input w-full"
          placeholder="Zoek op gebruikersnaam..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />

        <p className="text-dim text-xs mt-2 mb-3">
          {query.trim()
            ? "Zoekresultaten"
            : "Geregistreerde spelers"}
        </p>

        {searchLoading ? (
          <p className="text-dim text-sm">
            Spelers laden...
          </p>
        ) : searchError ? (
          <p className="text-red text-sm">
            {searchError}
          </p>
        ) : results.length === 0 ? (
          <p className="text-dim text-sm">
            {query.trim()
              ? "Geen spelers gevonden."
              : "Er zijn nog geen andere spelers."}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {results.map((p) => {
              const status = getFriendshipStatus(p.id);

              const requestBody = {
                targetUsername: p.username,
              };

              const requestKey =
                "/api/friends/request" +
                JSON.stringify(requestBody);

              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 bg-bgalt rounded-lg px-3 py-3 text-sm"
                >
                  <div className="flex flex-col gap-1 min-w-0">
                    <span className="font-semibold truncate">
                      {p.username}
                    </span>

                    <RankBadge
                      rating={p.rating}
                      small
                    />
                  </div>

                  {status === "accepted" ? (
                    <span className="text-teal text-xs whitespace-nowrap">
                      Al bevriend
                    </span>
                  ) : status === "outgoing" ? (
                    <span className="text-dim text-xs text-right">
                      Verzoek verstuurd
                    </span>
                  ) : status === "incoming" ? (
                    <span className="text-gold text-xs text-right">
                      Reageer hieronder
                    </span>
                  ) : (
                    <button
                      className="btn-ghost !py-1.5 !px-3 !text-xs whitespace-nowrap"
                      disabled={busy !== null}
                      onClick={() =>
                        call(
                          "/api/friends/request",
                          requestBody
                        )
                      }
                    >
                      {busy === requestKey
                        ? "Bezig..."
                        : "+ Vriend"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* FOUTMELDINGEN */}

      {message && (
        <p className="text-red text-sm">
          {message}
        </p>
      )}

      {/* UITDAGINGEN */}

      {(incomingChallenges.length > 0 ||
        acceptedChallenges.length > 0) && (
        <div className="panel border-gold">
          <h2 className="font-display text-lg text-gold mb-2">
            Uitdagingen
          </h2>

          <div className="flex flex-col gap-2">
            {incomingChallenges.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between bg-bgalt rounded-lg px-3 py-2 text-sm"
              >
                <span>
                  <b>{c.challenger?.username}</b> daagt je uit
                </span>

                <div className="flex gap-1.5">
                  <button
                    className="btn-primary !py-1.5 !px-3 !text-xs"
                    disabled={busy !== null}
                    onClick={() =>
                      call("/api/challenges/respond", {
                        challengeId: c.id,
                        accept: true,
                      })
                    }
                  >
                    Accepteer
                  </button>

                  <button
                    className="btn-ghost !py-1.5 !px-3 !text-xs"
                    disabled={busy !== null}
                    onClick={() =>
                      call("/api/challenges/respond", {
                        challengeId: c.id,
                        accept: false,
                      })
                    }
                  >
                    Weiger
                  </button>
                </div>
              </div>
            ))}

            {acceptedChallenges.map((c) => (
              <button
                key={c.id}
                onClick={() =>
                  router.push(`/match/${c.match_id}`)
                }
                className="flex items-center justify-between bg-bgalt rounded-lg px-3 py-2 text-sm w-full text-left"
              >
                <span>
                  Live tegen{" "}
                  <b>
                    {c.challenger_id === userId
                      ? c.opponent?.username
                      : c.challenger?.username}
                  </b>
                </span>

                <span className="text-teal underline text-xs">
                  Speel verder
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* MIJN VRIENDEN */}

      <div className="panel">
        <h2 className="font-display text-lg text-gold mb-2">
          Vrienden{" "}
          <span className="text-dim text-sm">
            ({friends.length})
          </span>
        </h2>

        {friends.length === 0 ? (
          <p className="text-dim text-sm">
            Nog geen vrienden. Voeg hierboven een speler toe.
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {friends.map((f) => {
              const other = otherOf(f);

              if (!other) return null;

              const alreadyChallenged =
                outgoingChallenges.some(
                  (c) => c.opponent_id === other.id
                );

              return (
                <div
                  key={f.id}
                  className="flex items-center justify-between bg-bgalt rounded-lg px-3 py-2 text-sm gap-2"
                >
                  <span className="font-semibold flex-1 truncate">
                    {other.username}
                  </span>

                  <RankBadge
                    rating={other.rating}
                    small
                  />

                  <button
                    className="btn-ghost !py-1.5 !px-3 !text-xs"
                    disabled={
                      alreadyChallenged ||
                      busy !== null
                    }
                    onClick={() =>
                      call("/api/challenges/create", {
                        opponentId: other.id,
                      })
                    }
                  >
                    {alreadyChallenged
                      ? "Uitgedaagd"
                      : "Daag uit"}
                  </button>

                  <button
                    className="text-dim text-xs underline"
                    disabled={busy !== null}
                    onClick={() =>
                      call("/api/friends/remove", {
                        friendshipId: f.id,
                      })
                    }
                  >
                    Verwijder
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ONTVANGEN VRIENDSCHAPSVERZOEKEN */}

      {incoming.length > 0 && (
        <div className="panel">
          <h2 className="font-display text-lg text-gold mb-2">
            Vriendschapsverzoeken
          </h2>

          <div className="flex flex-col gap-1">
            {incoming.map((f) => {
              const other = otherOf(f);

              return (
                <div
                  key={f.id}
                  className="flex items-center justify-between bg-bgalt rounded-lg px-3 py-2 text-sm"
                >
                  <span className="font-semibold">
                    {other?.username}
                  </span>

                  <div className="flex gap-1.5">
                    <button
                      className="btn-primary !py-1.5 !px-3 !text-xs"
                      disabled={busy !== null}
                      onClick={() =>
                        call("/api/friends/respond", {
                          friendshipId: f.id,
                          accept: true,
                        })
                      }
                    >
                      Accepteer
                    </button>

                    <button
                      className="btn-ghost !py-1.5 !px-3 !text-xs"
                      disabled={busy !== null}
                      onClick={() =>
                        call("/api/friends/respond", {
                          friendshipId: f.id,
                          accept: false,
                        })
                      }
                    >
                      Weiger
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VERSTUURDE VERZOEKEN */}

      {outgoing.length > 0 && (
        <div className="panel">
          <h2 className="font-display text-lg text-gold mb-2">
            Verstuurde verzoeken
          </h2>

          <div className="flex flex-col gap-1">
            {outgoing.map((f) => {
              const other = otherOf(f);

              return (
                <div
                  key={f.id}
                  className="flex items-center justify-between bg-bgalt rounded-lg px-3 py-2 text-sm"
                >
                  <span className="text-dim">
                    {other?.username}
                  </span>

                  <button
                    className="text-dim text-xs underline"
                    disabled={busy !== null}
                    onClick={() =>
                      call("/api/friends/remove", {
                        friendshipId: f.id,
                      })
                    }
                  >
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
