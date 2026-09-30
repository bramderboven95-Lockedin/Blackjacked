// Server-side Supabase client for use in Server Components, Route Handlers
// and Server Actions. Reads the session from cookies. Still subject to RLS —
// use admin.ts when an operation must bypass RLS (rating/token writes).
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component with no writable cookie store —
            // safe to ignore as long as middleware.ts is refreshing sessions.
          }
        },
      },
    }
  );
}
