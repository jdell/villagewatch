import type { CookieOptions } from "@supabase/ssr";

/**
 * The flags every Supabase session cookie is written with — VW-01.
 *
 * There is one copy because there are two `createServerClient` calls that have
 * to agree: `src/lib/supabase/server.ts` and `src/proxy.ts`. The proxy refreshes
 * the session cookies on nearly every navigation, so a flag set in one and not
 * the other is not a partial fix — it is a fix the next page load undoes, with
 * nothing on screen to say so.
 *
 * `@supabase/ssr` applies `DEFAULT_COOKIE_OPTIONS` where a caller passes none:
 * `{ path: "/", sameSite: "lax", httpOnly: false, maxAge: 400 days }`
 * (`node_modules/@supabase/ssr/dist/main/utils/constants.js`). Neither call
 * passed any, so the access token **and** the refresh token were readable by any
 * script on the page and lived for over a year.
 *
 * That matters more here than on a typical app, because two third-party scripts
 * already run on authenticated pages — the OneSignal SDK from `cdn.onesignal.com`
 * and the MediaPipe WASM runtime from `cdn.jsdelivr.net`. Without `HttpOnly`, a
 * compromise of either, or any XSS anywhere in the app, is a refresh-token theft
 * with a 400-day life rather than a session hijack that ends with the tab.
 *
 * **Why this is safe to set here, when the usual objection is that the browser
 * client needs to read the cookie.** It does not, in this codebase.
 * `src/lib/supabase/client.ts` has exactly two call sites — `google-button.tsx`
 * (`signInWithOAuth`) and `forgot-password-form.tsx` (`resetPasswordForEmail`) —
 * and neither reads an existing session. The PKCE verifier is written by the
 * browser through `document.cookie`, which cannot set `HttpOnly` and is
 * unaffected by it; `PushRegistration` already receives `userId` as a
 * server-rendered prop rather than reading it out of a token.
 */
export const SUPABASE_COOKIE_OPTIONS: CookieOptions = {
  /**
   * The whole point. No script on the page can read the session, so an injected
   * one cannot steal the refresh token.
   */
  httpOnly: true,

  /**
   * Production only, which is the audit's own recommendation rather than a
   * blanket `true`. Browsers refuse a `Secure` cookie sent over plain HTTP, and
   * `npm run dev` serves `http://localhost:3000` — Chrome and Firefox now treat
   * localhost as a trustworthy origin and would accept it, Safari has
   * historically not, and a sign-in that works in two browsers and silently
   * fails in the third is a worse trade than a dev cookie without the flag. In
   * production `NODE_ENV` is `production`, so the flag is set where the finding
   * actually applies. `Strict-Transport-Security` in `next.config.ts` is what
   * stops a production request reaching plain HTTP in the first place.
   */
  secure: process.env.NODE_ENV === "production",

  /**
   * Unchanged from the library default, and deliberately not `strict`. The
   * OAuth and password-recovery legs both return from Supabase as a top-level
   * cross-site navigation to `/api/auth/callback`; under `strict` the browser
   * would withhold the cookies on arrival and the exchange would land on a page
   * that cannot see the session it has just created.
   */
  sameSite: "lax",

  /** Also the library default. Named rather than inherited, so it is reviewable. */
  path: "/",
};

/**
 * How long a browser keeps a session cookie, in seconds. Seven days.
 *
 * **This cannot be passed through `cookieOptions` and it is worth knowing why,
 * because doing so looks like it works.** `@supabase/ssr` spreads the caller's
 * options and then overwrites the result:
 *
 * ```js
 * const setCookieOptions = {
 *   ...DEFAULT_COOKIE_OPTIONS,
 *   ...options?.cookieOptions,
 *   maxAge: DEFAULT_COOKIE_OPTIONS.maxAge,   // 400 days, unconditionally
 * };
 * ```
 *
 * — `dist/main/cookies.js`, in both the storage adapter and the server-side
 * response path. A `maxAge` in `cookieOptions` is accepted by the types,
 * discarded at run time, and leaves a 400-day cookie behind looking shortened.
 * So the clamp happens at the only place the options are ours: the `setAll`
 * callback, just before the cookie is handed to the store.
 *
 * Seven days rather than the library's ceiling because 400 days is not a
 * decision anybody made about coordinators — it is the browser's limit, which
 * the library adopted as a default. A resident who has not opened VillageWatch
 * for a week signs in again; a stolen cookie stops working in the same week.
 */
export const SUPABASE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * Applies the lifetime ceiling to one cookie's options on the way to the store.
 *
 * `Math.min`, never assignment, because the same callback carries the
 * **deletions**: signing out writes the session cookies with `maxAge: 0`, and
 * raising that to a week would leave a signed-out browser holding the cookie it
 * had just been told to drop. Zero and any other short life pass through
 * untouched; only the library's 400 days is brought down.
 *
 * `expires` is cleared where it appears alongside. Nothing in `@supabase/ssr`
 * sets it today, but the two are alternative spellings of the same thing and a
 * browser prefers whichever it is given — a stale `expires` would quietly
 * outlive the `maxAge` beside it.
 */
export function withCookieLifetime(options: CookieOptions): CookieOptions {
  const clamped: CookieOptions = {
    ...options,
    maxAge: Math.min(
      options.maxAge ?? SUPABASE_COOKIE_MAX_AGE_SECONDS,
      SUPABASE_COOKIE_MAX_AGE_SECONDS,
    ),
  };

  delete clamped.expires;

  return clamped;
}
