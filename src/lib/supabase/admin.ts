// Service-role Supabase client — bypasses RLS entirely. Import ONLY in
// server-only code (API routes) that has already authenticated the caller
// itself. Never import this from a Client Component or expose the key to
// the browser.
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
