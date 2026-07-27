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

/**
 * Whether to offer "Continue with Google".
 *
 * There is no key to hold — the provider's client id and secret live in the
 * Supabase dashboard, not here — so this is a flag rather than a credential,
 * and it exists because the button cannot detect its own backend. With Google
 * switched off in the dashboard, `signInWithOAuth` still redirects and the
 * failure lands back on `/api/auth/callback` as `error=provider_disabled`,
 * which is a confusing round trip to offer somebody. Off unless asked for.
 */
export const isGoogleAuthEnabled =
  isSupabaseConfigured &&
  process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

export function assertSupabaseConfigured() {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and set " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
}
