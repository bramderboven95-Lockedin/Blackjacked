"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import TabBar from "@/components/TabBar";
import { CLASS_DEFS, PERK_DEFS, PERK_TIERS } from "@/lib/game/engine";

type Profile = {
  id: string;
  tokens: number;
  perks: string[];
  preferred_class: string;
  preferred_perks: string[];
};

export default function ShopPage() {
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, tokens, perks, preferred_class, preferred_perks")
      .eq("id", user.id)
      .single();
    setProfile(data as Profile);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function buy(perkId: string) {
    setBusy(true);
    setMessage("");
    const res = await fetch("/api/shop/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ perkId }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) setMessage(json.error);
    else load();
  }

  async function setClass(classId: string) {
    if (!profile) return;
    setProfile({ ...profile, preferred_class: classId });
    await supabase.from("profiles").update({ preferred_class: classId }).eq("id", profile.id);
  }

  async function togglePerk(perkId: string) {
    if (!profile) return;
    const has = profile.preferred_perks.includes(perkId);
    const next = has
      ? profile.preferred_perks.filter((p) => p !== perkId)
      : profile.preferred_perks.length < 2
      ? [...profile.preferred_perks, perkId]
      : profile.preferred_perks;
    setProfile({ ...profile, preferred_perks: next });
    await supabase.from("profiles").update({ preferred_perks: next }).eq("id", profile.id);
  }

  if (!profile) {
    return (
      <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto">
        <p className="text-dim text-center">Laden&hellip;</p>
        <TabBar />
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto flex flex-col gap-4">
      <h1 className="font-display text-2xl text-goldbright">Perk Shop</h1>

      <div className="panel">
        <h2 className="font-display text-lg text-gold mb-2">Jouw build</h2>
        <p className="text-dim text-xs mb-3">
          Deze class en perks worden automatisch gebruikt in elke match \u2014 zowel campaign als tegen vrienden.
        </p>
        <div className="flex gap-2 mb-3">
          {Object.values(CLASS_DEFS).map((c) => (
            <button
              key={c.id}
              onClick={() => setClass(c.id)}
              className={`flex-1 text-left bg-bgalt border rounded-lg p-2 ${
                profile.preferred_class === c.id ? "border-gold" : "border-line"
              }`}
            >
              <div className="font-display text-sm">{c.label}</div>
              <div className="text-[10px] text-dim">{c.shortHint}</div>
            </button>
          ))}
        </div>
        <p className="text-xs text-dim italic mb-2">
          {CLASS_DEFS[profile.preferred_class]?.passive}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {profile.perks.length === 0 && <span className="text-dim text-xs">Nog geen perks unlocked.</span>}
          {profile.perks.map((pid) => {
            const perk = PERK_DEFS.find((p) => p.id === pid);
            if (!perk) return null;
            const active = profile.preferred_perks.includes(pid);
            return (
              <button
                key={pid}
                onClick={() => togglePerk(pid)}
                className={`text-[11px] rounded-full px-2.5 py-1 border ${
                  active ? "border-gold bg-gold/15 text-goldbright" : "border-line text-text"
                }`}
                title={perk.desc}
              >
                {perk.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="panel !p-2">
        <div className="px-3 py-2 text-sm">
          {"\u{1F39F}"} <b>{profile.tokens}</b> tokens
        </div>
        {message && <p className="text-red text-xs px-3">{message}</p>}
        {PERK_TIERS.map((tier) => (
          <div key={tier.id} className="mb-3 px-1">
            <div className="text-[11px] uppercase tracking-wide text-gold font-bold mb-1.5 px-2">{tier.label}</div>
            <div className="flex flex-col gap-1.5">
              {PERK_DEFS.filter((p) => p.tier === tier.id).map((perk) => {
                const owned = profile.perks.includes(perk.id);
                return (
                  <div key={perk.id} className="flex items-center justify-between bg-bgalt rounded-lg px-3 py-2">
                    <div>
                      <div className="font-semibold text-sm">{perk.name}</div>
                      <div className="text-dim text-xs">{perk.desc}</div>
                    </div>
                    {owned ? (
                      <span className="text-teal text-xs font-bold">In bezit</span>
                    ) : (
                      <button className="btn-primary !py-1.5 !px-3 !text-xs" disabled={busy || profile.tokens < perk.cost} onClick={() => buy(perk.id)}>
                        Koop &middot; {perk.cost}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <TabBar />
    </main>
  );
}
