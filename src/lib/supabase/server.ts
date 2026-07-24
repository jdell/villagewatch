import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/supabase/env";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * Next.js 16: `cookies()` is async, so this factory is async too — always
 * `await createClient()`. Never hoist the result into a module-level constant;
 * each request needs its own client bound to that request's cookies.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // `src/proxy.ts` refreshes the session cookies on every request, so
          // this is safe to ignore.
        }
      },
    },
  });
}
