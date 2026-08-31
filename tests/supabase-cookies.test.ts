import { describe, expect, it } from "vitest";
import {
  SUPABASE_COOKIE_MAX_AGE_SECONDS,
  SUPABASE_COOKIE_OPTIONS,
  withCookieLifetime,
} from "@/lib/supabase/cookie-options";

/**
 * The flags and the lifetime on every Supabase session cookie — VW-01.
 *
 * What is worth pinning here is not that the object has the right keys, which a
 * reader can see. It is the **clamp**, because that function has a second caller
 * nobody thinks about: `setAll` carries the deletions as well as the writes.
 * Signing out writes the session cookies with `maxAge: 0`, and a lifetime
 * applied by assignment rather than by `Math.min` would raise that to a week —
 * leaving a signed-out browser holding the cookie it had just been told to drop,
 * on a shared device, with nothing on screen to say so. That is a bug an
 * ordinary read of the diff passes straight over, because the line looks like it
 * is only about shortening things.
 *
 * The other half is that `@supabase/ssr` **overwrites `maxAge`** after spreading
 * the caller's `cookieOptions` — so the ceiling cannot live in that object and
 * has to be applied here. A future tidying pass that "simplifies" this by moving
 * the number into `SUPABASE_COOKIE_OPTIONS` would type-check, read better, and
 * silently restore the 400-day cookie. The assertion that `SUPABASE_COOKIE_OPTIONS`
 * carries no `maxAge` is what catches that.
 */

describe("SUPABASE_COOKIE_OPTIONS", () => {
  it("keeps the session out of reach of any script on the page", () => {
    // The whole finding. Two third-party scripts run on authenticated pages.
    expect(SUPABASE_COOKIE_OPTIONS.httpOnly).toBe(true);
  });

  it("stays SameSite=Lax, which both return legs depend on", () => {
    // `strict` would withhold the cookies on the top-level cross-site
    // navigation back from Supabase, so the OAuth and recovery exchanges would
    // land on a page that cannot see the session they just created.
    expect(SUPABASE_COOKIE_OPTIONS.sameSite).toBe("lax");
  });

  it("scopes the cookie to the whole origin", () => {
    expect(SUPABASE_COOKIE_OPTIONS.path).toBe("/");
  });

  it("carries no maxAge, because the library would discard it", () => {
    // Not an oversight — see the module. `@supabase/ssr` spreads these options
    // and then overwrites `maxAge` with its own 400-day default, so a value here
    // is accepted by the types, dropped at run time, and reads as a fix.
    expect(SUPABASE_COOKIE_OPTIONS.maxAge).toBeUndefined();
  });
});

describe("withCookieLifetime", () => {
  it("brings the library's 400 days down to the ceiling", () => {
    const fourHundredDays = 400 * 24 * 60 * 60;

    expect(withCookieLifetime({ maxAge: fourHundredDays }).maxAge).toBe(
      SUPABASE_COOKIE_MAX_AGE_SECONDS,
    );
  });

  it("leaves a deletion at zero", () => {
    // The case that makes this `Math.min` rather than an assignment. Sign-out
    // writes `maxAge: 0`; raising it would keep the cookie the browser was told
    // to drop.
    expect(withCookieLifetime({ maxAge: 0 }).maxAge).toBe(0);
  });

  it("leaves anything already shorter alone", () => {
    expect(withCookieLifetime({ maxAge: 60 }).maxAge).toBe(60);
  });

  it("applies the ceiling when the library sends no maxAge at all", () => {
    expect(withCookieLifetime({}).maxAge).toBe(SUPABASE_COOKIE_MAX_AGE_SECONDS);
  });

  it("drops `expires`, which would outlive the maxAge beside it", () => {
    // Nothing in `@supabase/ssr` sets it today. The two are alternative
    // spellings of the same thing and a browser honours whichever it is given,
    // so a stale one arriving later would quietly undo the clamp.
    const out = withCookieLifetime({
      maxAge: 400 * 24 * 60 * 60,
      expires: new Date("2030-01-01T00:00:00Z"),
    });

    expect(out.expires).toBeUndefined();
    expect(out.maxAge).toBe(SUPABASE_COOKIE_MAX_AGE_SECONDS);
  });

  it("passes every other option through untouched", () => {
    // The proxy hands these straight to `response.cookies.set`, so dropping
    // `httpOnly` here would undo the finding's actual fix one layer down.
    const out = withCookieLifetime({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      domain: "villagewatch.example",
      maxAge: 400 * 24 * 60 * 60,
    });

    expect(out.httpOnly).toBe(true);
    expect(out.secure).toBe(true);
    expect(out.sameSite).toBe("lax");
    expect(out.path).toBe("/");
    expect(out.domain).toBe("villagewatch.example");
  });

  it("is a week, and not the library's ceiling", () => {
    expect(SUPABASE_COOKIE_MAX_AGE_SECONDS).toBe(60 * 60 * 24 * 7);
  });
});
