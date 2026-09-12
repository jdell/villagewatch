import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ErrorEvent } from "@sentry/nextjs";

import { scrubEvent, tracesSampleRate } from "@/lib/sentry-scrub";

/**
 * What may leave for Sentry.
 *
 * `beforeSend` is the last thing that runs before an event goes to a processor
 * in Frankfurt, and everything it fails to remove is disclosed. The three
 * `Sentry.init` calls share this one function precisely so there is one thing
 * to assert against rather than three that can drift.
 *
 * What is asserted is the **removal**, not the wording of anything. Two of
 * these are the kind of test `format-social-post.test.ts` writes: the unsafe
 * value is smuggled in on a real event shape and the assertion is that it does
 * not come out — because the failure is silent, is invisible from every screen
 * in the app, and is one careless `sendDefaultPii: true` away at all times.
 *
 * The session cookie is the one to read first. `sb-access-token` is a live
 * Supabase session, and an access token sitting in an issue tracker is an
 * account handed to everybody who can open the issue.
 */

/** A realistically-shaped event, with every unsafe field populated. */
function eventWithRequest(): ErrorEvent {
  return {
    type: undefined,
    message: "Something failed",
    request: {
      url: "https://villagewatch.app/register?code=HISTON24&next=/map",
      method: "POST",
      query_string: "code=HISTON24&next=/map",
      cookies: {
        "sb-access-token": "eyJhbGciOiJIUzI1NiJ9.live-session-token",
        "sb-refresh-token": "v1.refresh.secret",
      },
      headers: {
        cookie: "sb-access-token=eyJhbGciOiJIUzI1NiJ9.live-session-token",
        authorization: "Bearer service-role-key",
        "x-forwarded-for": "203.0.113.7",
        "user-agent": "Mozilla/5.0",
        "content-type": "application/json",
      },
      data: {
        rawDescription: "Dave at number 42 was shouting again, reg AB12 CDE",
        email: "resident@example.com",
      },
    },
    user: { id: "auth-user-1", email: "resident@example.com", ip_address: "203.0.113.7" },
  } as ErrorEvent;
}

describe("scrubEvent", () => {
  it("removes the session cookie in both places it appears", () => {
    const scrubbed = scrubEvent(eventWithRequest());
    const serialised = JSON.stringify(scrubbed);

    // Sentry carries cookies twice — parsed onto `request.cookies` and raw in
    // the `cookie` header — and removing only the first looks like it worked.
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(serialised).not.toContain("sb-access-token");
    expect(serialised).not.toContain("live-session-token");
    expect(serialised).not.toContain("v1.refresh.secret");
  });

  it("removes the request body, which is where a reporter's own words are", () => {
    const scrubbed = scrubEvent(eventWithRequest());
    const serialised = JSON.stringify(scrubbed);

    expect(scrubbed.request?.data).toBeUndefined();
    // Domain rule 1: the verbatim wording does not leave the village boundary.
    expect(serialised).not.toContain("number 42");
    expect(serialised).not.toContain("AB12 CDE");
  });

  it("strips the query string, which carries a village's join code", () => {
    const scrubbed = scrubEvent(eventWithRequest());
    const serialised = JSON.stringify(scrubbed);

    // A join code in an issue tracker is a credential that cannot be rotated
    // out of it — the reasoning `/invite/[slug]` is noindex for.
    expect(serialised).not.toContain("HISTON24");
    expect(scrubbed.request?.query_string).toBeUndefined();
    // ...and the path survives, because it is what makes an issue findable.
    expect(scrubbed.request?.url).toBe("https://villagewatch.app/register");
  });

  it("keeps only allow-listed headers", () => {
    const scrubbed = scrubEvent(eventWithRequest());
    const headers = scrubbed.request?.headers ?? {};

    expect(Object.keys(headers).sort()).toEqual(["content-type", "user-agent"]);
    // An allow-list rather than a deny-list, so a header a future proxy adds is
    // withheld until somebody thinks about it.
    expect(headers.authorization).toBeUndefined();
    expect(headers["x-forwarded-for"]).toBeUndefined();
  });

  it("drops user context even when something set it", () => {
    const scrubbed = scrubEvent(eventWithRequest());

    // Nothing in the app calls `Sentry.setUser`; this is the backstop for the
    // day something does, and for `sendDefaultPii` being flipped by an upgrade.
    expect(scrubbed.user).toBeUndefined();
  });

  it("survives an event with no request at all", () => {
    // Most events have none — anything thrown outside a request, and every
    // browser-side capture from the three error boundaries.
    const event = { message: "no request here" } as ErrorEvent;

    expect(() => scrubEvent(event)).not.toThrow();
    expect(scrubEvent(event).message).toBe("no request here");
  });

  it("fails towards sending less, not more", () => {
    // A frozen request object makes `delete` throw in strict mode, which is the
    // cheapest way to reach the catch. The wrong recovery is returning the
    // event as it arrived: this function exists because that event is not safe
    // to send.
    const event = eventWithRequest();
    Object.freeze(event.request);

    const scrubbed = scrubEvent(event);

    expect(scrubbed.request).toBeUndefined();
    expect(scrubbed.user).toBeUndefined();
    expect(JSON.stringify(scrubbed)).not.toContain("live-session-token");
  });
});

describe("tracesSampleRate", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is off when unset", () => {
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "");
    expect(tracesSampleRate()).toBe(0);
  });

  it("reads a proportion", () => {
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "0.1");
    expect(tracesSampleRate()).toBeCloseTo(0.1);
  });

  it("refuses junk rather than passing NaN to the SDK", () => {
    // `NaN` is read by the SDK as one thing on one release and another on the
    // next, and one of those two readings is a bill.
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "yes please");
    expect(tracesSampleRate()).toBe(0);
  });

  it("clamps a value above one", () => {
    vi.stubEnv("SENTRY_TRACES_SAMPLE_RATE", "50");
    expect(tracesSampleRate()).toBe(1);
  });
});
