"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError(
        signInError.message.toLowerCase().includes("invalid")
          ? "Onjuiste e-mail of wachtwoord."
          : signInError.message.toLowerCase().includes("confirm")
          ? "Bevestig eerst je e-mailadres via de link die we je stuurden."
          : signInError.message
      );
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="panel max-w-sm w-full flex flex-col gap-4">
        <h1 className="font-display text-3xl text-goldbright text-center tracking-wide">BLACKJACKED</h1>
        <p className="text-dim text-sm text-center -mt-2">Log in</p>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-dim">E-mail</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-dim">Wachtwoord</label>
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-red text-sm">{error}</p>}

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Bezig\u2026" : "INLOGGEN"}
        </button>
        <p className="text-dim text-xs text-center">
          Nog geen account?{" "}
          <Link href="/register" className="text-teal underline">
            Registreer
          </Link>
        </p>
      </form>
    </main>
  );
}
