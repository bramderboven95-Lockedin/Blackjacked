
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import TabBar from "@/components/TabBar";

import type {
  BotDefinition,
} from "@/lib/game/engine";

import type {
  ChallengerDifficulty,
} from "@/lib/game/botRating";

export default function ChallengerPage() {

  const router = useRouter();

  const [bot, setBot] =
    useState<BotDefinition | null>(null);

  const [rating, setRating] =
    useState<number | null>(null);

  const [active, setActive] =
    useState<string | null>(null);

  const [busy, setBusy] = useState(false);

  const [error, setError] = useState("");

  useEffect(() => {

    fetch("/api/matches/random", {
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((j) => {

        setActive(j.matchId || null);
        setBot(j.bot || null);
        setRating(j.rating ?? null);

        if (j.error) {
          setError(j.error);
        }
      })
      .catch(() => {
        setError("Kon Challenger niet laden.");
      });

  }, []);

  async function start(
    difficulty: ChallengerDifficulty
  ) {

    if (busy) return;

    setBusy(true);
    setError("");

    try {

      const response = await fetch(
        "/api/matches/random",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            difficulty,
          }),
        }
      );

      const j = await response.json();

      if (!response.ok || !j.matchId) {
        throw new Error(
          j.error || "Kon geen match starten."
        );
      }

      router.push(`/match/${j.matchId}`);

    } catch (e) {

      setError(
        e instanceof Error
          ? e.message
          : "Onbekende fout."
      );

      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen pb-24 px-4 pt-6 max-w-lg mx-auto flex flex-col gap-4">

      <Link
        href="/dashboard"
        className="text-dim text-xs"
      >
        ← Hoofdmenu
      </Link>

      <h1 className="font-display text-2xl text-goldbright">
        🎲 RANDOM CHALLENGER
      </h1>

      <p className="text-dim text-sm">
        Kies je moeilijkheid. Iedere Challenger heeft
        willekeurige stats en een rating die op zijn
        sterkte wordt gebaseerd.
      </p>

      {active ? (

        <div className="panel flex flex-col gap-3">

          <h2 className="font-display text-xl text-gold">
            LOPENDE CHALLENGER
          </h2>

          {bot && (
            <>
              <p className="font-bold">
                {bot.name}
              </p>

              <div className="grid grid-cols-3 gap-2 text-center">

                <div className="bg-bgalt rounded p-3">
                  ATK
                  <b className="block text-xl">
                    {bot.atk}
                  </b>
                </div>

                <div className="bg-bgalt rounded p-3">
                  DEF
                  <b className="block text-xl">
                    {bot.def}
                  </b>
                </div>

                <div className="bg-bgalt rounded p-3">
                  HP
                  <b className="block text-xl">
                    {bot.hp}
                  </b>
                </div>

              </div>
            </>
          )}

          <p className="text-dim text-sm">
            Botrating: {rating ?? "onbekend"}
          </p>

          <p className="text-dim text-xs">
            Maak eerst je bestaande Challenger af
            voordat je een nieuwe kunt trekken.
          </p>

          <button
            className="btn-primary"
            disabled={busy}
            onClick={() =>
              router.push(`/match/${active}`)
            }
          >
            HERVAT CHALLENGER
          </button>

        </div>

      ) : (

        <div className="flex flex-col gap-4">

          {/* EASY CHALLENGER */}

          <div className="panel flex flex-col gap-3">

            <h2 className="font-display text-xl text-gold">
              ♣ EASY CHALLENGER
            </h2>

            <p className="text-dim text-sm">
              Een onvoorspelbare maar relatief
              toegankelijke tegenstander.
            </p>

            <div className="grid grid-cols-3 gap-2 text-center">

              <div className="bg-bgalt rounded p-3">
                <span className="text-dim text-xs">
                  ATK
                </span>
                <b className="block text-xl">
                  1–19
                </b>
              </div>

              <div className="bg-bgalt rounded p-3">
                <span className="text-dim text-xs">
                  DEF
                </span>
                <b className="block text-xl">
                  1–19
                </b>
              </div>

              <div className="bg-bgalt rounded p-3">
                <span className="text-dim text-xs">
                  HP
                </span>
                <b className="block text-xl">
                  50–150
                </b>
              </div>

            </div>

            <p className="text-dim text-xs">
              Geschatte rating: 850–1660.
              Dynamische Glicko-beloningen.
            </p>

            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => start("easy")}
            >
              {busy
                ? "BEZIG..."
                : "SPEEL EASY CHALLENGER"}
            </button>

          </div>

          {/* HARD CHALLENGER */}

          <div className="panel flex flex-col gap-3">

            <h2 className="font-display text-xl text-gold">
              ♠ HARD CHALLENGER
            </h2>

            <p className="text-dim text-sm">
              Sterke tegenstanders met hoge stats
              en slimmere blackjack-AI.
            </p>

            <div className="grid grid-cols-3 gap-2 text-center">

              <div className="bg-bgalt rounded p-3">
                <span className="text-dim text-xs">
                  ATK
                </span>
                <b className="block text-xl">
                  20–40
                </b>
              </div>

              <div className="bg-bgalt rounded p-3">
                <span className="text-dim text-xs">
                  DEF
                </span>
                <b className="block text-xl">
                  20–40
                </b>
              </div>

              <div className="bg-bgalt rounded p-3">
                <span className="text-dim text-xs">
                  HP
                </span>
                <b className="block text-xl">
                  151–350
                </b>
              </div>

            </div>

            <p className="text-dim text-xs">
              Geschatte rating: 1725–2800.
              Meer ratingpotentieel bij een overwinning.
            </p>

            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => start("hard")}
            >
              {busy
                ? "BEZIG..."
                : "SPEEL HARD CHALLENGER"}
            </button>

          </div>

        </div>
      )}

      {error && (
        <p
          role="alert"
          className="text-red text-xs"
        >
          {error}
        </p>
      )}

      <TabBar />

    </main>
  );
}
