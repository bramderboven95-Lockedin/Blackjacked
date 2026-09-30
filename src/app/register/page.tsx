"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(username)) {
      setError("Gebruikersnaam: 3-16 tekens, alleen letters/cijfers/underscore.");
      return;
    }
    if (password.length < 8) {
      setError("Wachtwoord moet minstens 8 tekens zijn.");
      return;
    }
    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (signUpError) {
      setError(
        signUpError.message.includes("duplicate") || signUpError.message.toLowerCase().includes("already")
          ? "Dit e-mailadres of deze gebruikersnaam is al in gebruik."
          : signUpError.message
      );
      return;
    }
    if (data.session) {
      router.replace("/dashboard");
    } else {
      setConfirmSent(true);
    }
  }

  if (confirmSent) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="panel max-w-sm w-full text-center">
          <h1 className="font-display text-3xl text-goldbright mb-3">Check je mail</h1>
          <p className="text-dim text-sm">
            We hebben een bevestigingslink gestuurd naar <b className="text-text">{email}</b>. Klik erop om je account
            te activeren, daarna kun je inloggen.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={handleSubmit} className="panel max-w-sm w-full flex flex-col gap-4">
        <h1 className="font-display text-3xl text-goldbright text-center tracking-wide">BLACKJACKED</h1>
        <p className="text-dim text-sm text-center -mt-2">Maak een account</p>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-dim">Gebruikersnaam</label>
          <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} maxLength={16} required />
        </div>
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
            minLength={8}
            required
          />
        </div>

        {error && <p className="text-red text-sm">{error}</p>}

        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Bezig\u2026" : "REGISTREREN"}
        </button>
        <p className="text-dim text-xs text-center">
          Al een account?{" "}
          <Link href="/login" className="text-teal underline">
            Log in
          </Link>
        </p>
      </form>
    </main>
  );
}
