
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TabBar from "@/components/TabBar";
import { BOTS } from "@/lib/game/engine";

export default function CampaignPage() {
  const router = useRouter();

  const [campaignPos, setCampaignPos] = useState<number | null>(null);
  const [activeMatchId, setActiveMatchId] = useState<string | null>(null);
  const [activeBotIndex, setActiveBotIndex] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCampaign() {
      const supabase = createClient();

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          if (!cancelled) {
            setError("Je bent niet ingelogd.");
          }
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("campaign_pos")
          .eq("id", user.id)
          .single();

        if (profileError) throw profileError;

        const response = await fetch("/api/matches/campaign", {
          method: "GET",
          cache: "no-store",
        });

        const json = await response.json();

        if (!response.ok) {
          throw new Error(
            json.error || "Kon je Campaign niet ophalen."
          );
        }

        if (!cancelled) {
          setCampaignPos(profile?.campaign_pos ?? 0);
          setActiveMatchId(json.activeMatchId ?? null);
          setActiveBotIndex(json.botIndex ?? null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Er ging iets mis bij het laden."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadCampaign();

    return () => {
      cancelled = true;
    };
  }, []);

  async function startFight() {
    if (starting) return;

    setStarting(true);
    setError("");

    try {
      const response = await fetch("/api/matches/campaign", {
        method: "POST",
      });

      const json = await response.json();

      if (!response.ok || !json.matchId) {
        throw new Error(
          json.error || "Kon de wedstrijd niet openen."
        );
      }

      router.push(`/match/${json.matchId}`);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Er ging iets mis."
      );
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto">
        <p className="text-dim text-center">Campaign laden...</p>
        <TabBar />
      </main>
    );
  }

  if (campaignPos === null) {
    return (
      <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto">
        <h1 className="font-display text-2xl text-goldbright mb-4">
          Campaign
        </h1>
        <p className="text-red text-sm">
          {error || "Campaign kon niet geladen worden."}
        </p>
        <TabBar />
      </main>
    );
  }

  const pos = Math.min(
    Math.max(0, campaignPos),
    BOTS.length - 1
  );

  const hasActiveMatch = activeMatchId !== null;

  const currentBot =
    hasActiveMatch && activeBotIndex !== null
      ? BOTS[activeBotIndex]
      : BOTS[pos];

  return (
    <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto flex flex-col gap-4">
      <h1 className="font-display text-2xl text-goldbright">
        Campaign
      </h1>

      <p className="text-dim text-sm -mt-2">
        Versla een bot om door te schuiven naar een sterkere.
        Verlies je, dan zak je terug naar de vorige.
        Bots hebben geen invloed op je Degen-rating.
      </p>

      {hasActiveMatch && (
        <div className="panel border-gold flex flex-col gap-2">
          <h2 className="font-display text-lg text-goldbright">
            Wedstrijd bezig
          </h2>

          <p className="text-sm text-dim">
            Je hebt nog een onafgewerkte wedstrijd tegen{" "}
            <b className="text-text">
              {currentBot?.name || "een bot"}
            </b>.
          </p>

          <p className="text-xs text-dim">
            Je voortgang is bewaard. Je kunt verder spelen
            vanaf waar je gestopt bent.
          </p>
        </div>
      )}

      <div className="panel">
        <div className="flex flex-col gap-1.5 mb-4">
          {BOTS.map((bot, idx) => {
            const state =
              idx < pos
                ? "beaten"
                : idx === pos
                ? "current"
                : "locked";

            return (
              <div
                key={bot.name}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${
                  state === "current"
                    ? "border-gold shadow-[0_0_14px_rgba(212,160,57,.25)]"
                    : state === "beaten"
                    ? "border-line opacity-60"
                    : "border-line opacity-40"
                } bg-bgalt`}
              >
                <span className="font-display text-dim w-5">
                  {idx + 1}
                </span>

                <span className="flex-1 font-semibold text-sm">
                  {bot.name}
                </span>

                {state === "beaten" && (
                  <span className="text-teal font-bold">
                    {"\u2713"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <button
          className="btn-primary block w-full text-center"
          disabled={starting}
          onClick={startFight}
        >
          {starting
            ? "BEZIG..."
            : hasActiveMatch
            ? "HERVAT WEDSTRIJD"
            : `SPEEL TEGEN ${BOTS[pos].name.toUpperCase()}`}
        </button>

        {hasActiveMatch && (
          <p className="text-dim text-xs text-center mt-2">
            Je bestaande wedstrijd wordt opnieuw geopend.
          </p>
        )}

        {!hasActiveMatch && pos === BOTS.length - 1 && (
          <p className="text-dim text-xs text-center mt-2">
            Je staat tegenover de laatste bot — blijf winnen
            of zak terug bij verlies.
          </p>
        )}
      </div>

      {error && (
        <p className="text-red text-sm">{error}</p>
      )}

      <TabBar />
    </main>
  );
}
