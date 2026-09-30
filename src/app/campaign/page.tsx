"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import TabBar from "@/components/TabBar";
import { BOTS } from "@/lib/game/engine";

export default function CampaignPage() {
  const supabase = createClient();
  const router = useRouter();
  const [campaignPos, setCampaignPos] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("campaign_pos").eq("id", user.id).single();
      setCampaignPos(data?.campaign_pos ?? 0);
    })();
  }, [supabase]);

  async function startFight() {
    setStarting(true);
    const res = await fetch("/api/matches/campaign", { method: "POST" });
    const json = await res.json();
    setStarting(false);
    if (res.ok) router.push(`/match/${json.matchId}`);
  }

  if (campaignPos === null) {
    return (
      <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto">
        <p className="text-dim text-center">Laden&hellip;</p>
        <TabBar />
      </main>
    );
  }

  const pos = Math.min(campaignPos, BOTS.length - 1);

  return (
    <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto flex flex-col gap-4">
      <h1 className="font-display text-2xl text-goldbright">Campaign</h1>
      <p className="text-dim text-sm -mt-2">
        Versla een bot om door te schuiven naar een sterkere. Verlies je, dan zak je terug naar de vorige. Bots
        hebben geen invloed op je Degen-rating.
      </p>

      <div className="panel">
        <div className="flex flex-col gap-1.5 mb-4">
          {BOTS.map((bot, idx) => {
            const state = idx < pos ? "beaten" : idx === pos ? "current" : "locked";
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
                <span className="font-display text-dim w-5">{idx + 1}</span>
                <span className="flex-1 font-semibold text-sm">{bot.name}</span>
                {state === "beaten" && <span className="text-teal font-bold">{"\u2713"}</span>}
              </div>
            );
          })}
        </div>
        <button className="btn-primary block w-full text-center" disabled={starting} onClick={startFight}>
          {starting ? "Bezig\u2026" : `SPEEL TEGEN ${BOTS[pos].name.toUpperCase()}`}
        </button>
        {pos === BOTS.length - 1 && (
          <p className="text-dim text-xs text-center mt-2">
            Je staat tegenover de laatste bot &mdash; blijf winnen of zak terug bij verlies.
          </p>
        )}
      </div>

      <TabBar />
    </main>
  );
}
