import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "@/lib/supabase/env";

/**
 * Service-role Supabase client. **Server only.**
 *
 * This key bypasses row-level security entirely, so anything that uses it has
 * to do its own authorisation first: check the session, check the village, and
 * only then touch storage. Importing this module from a Client Component would
 * leak the key into the bundle — it is only ever imported from Route Handlers.
 *
 * It exists because Storage policies are not configured yet (see "Not built
 * yet" in CLAUDE.md). Once the `incident-media` bucket has village-scoped
 * policies, media uploads should move back to the request-scoped client in
 * `src/lib/supabase/server.ts` and let RLS do the work.
 */

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const STORAGE_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET ?? "incident-media";

export const isStorageConfigured =
  SUPABASE_URL.length > 0 && SERVICE_ROLE_KEY.length > 0;

export function createAdminClient() {
  if (!isStorageConfigured) {
    throw new Error(
      "Supabase Storage is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY in .env.local.",
    );
  }

  return createSupabaseClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
