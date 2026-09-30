// Browser-side Supabase client. Subject to RLS — this is what powers
// realtime subscriptions (match updates, notifications) and any read the
// client is allowed to do directly.
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
