/**
 * Supabase environment, read in one place.
 *
 * These are `NEXT_PUBLIC_*` so they are inlined at build time and safe to read
 * from the browser, the server, and the proxy alike. The service-role key is
 * deliberately NOT exported here — it must never reach a client bundle.
 */
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * False until the env vars are filled in. Auth helpers degrade gracefully
 * rather than throwing, so the app still builds and the landing page still
 * renders on a fresh clone.
 */
export const isSupabaseConfigured =
  SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;

export function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and set " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
}
