import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { firstForwardedAddress } from "@/lib/audit-context";

/**
 * The limiter is the brake on the three call sites that cost real money or real
 * coordinator attention, and until it moved into Postgres it was a `Map` that
 * reset on every cold start — so what is worth asserting here is not that a
 * counter counts, but the four properties that make it a limit at all:
 *
 *   * a caller under their quota is allowed and one over it is not;
 *   * two rules never share a window for the same subject;
 *   * two subjects never share one either;
 *   * a database failure allows the request rather than blocking a report.
 *
 * `prisma.$queryRaw` is mocked with a real counter keyed the way the unique
 * constraint is — `(userId, action, windowStart)` — so the independence tests
 * exercise the key the SQL actually uses rather than a stub that returns a
 * number somebody chose.
 */

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}));

const {
  RATE_LIMITS,
  authSubject,
  formatRetryAfter,
  rateLimit,
  rateLimitHeaders,
  tooManyRequests,
} = await import("@/lib/rate-limit");

/** `(userId, action, windowStart)` → count, which is what the index is. */
const counters = new Map<string, number>();

beforeEach(() => {
  counters.clear();
  vi.stubEnv("DATABASE_URL", "postgres://test");

  // The tagged template hands the interpolations through in source order:
  // subject, rule name, window start.
  mocks.queryRaw.mockImplementation(
    (_strings: TemplateStringsArray, subject: string, action: string, windowStart: Date) => {
      const key = `${subject}|${action}|${windowStart.getTime()}`;
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return Promise.resolve([{ count }]);
    },
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  mocks.queryRaw.mockReset();
});

describe("rateLimit", () => {
  it("allows every call up to the limit", async () => {
    const rule = RATE_LIMITS.aiProcess;
    const results = [];

    for (let i = 0; i < rule.limit; i += 1) {
      results.push(await rateLimit(rule, "resident-1"));
    }

    expect(results.every((r) => r.ok)).toBe(true);
    // Derived from the rule rather than written out: this assertion was
    // `[4, 3, 2, 1, 0]` and had to be edited by hand the first time the limit
    // moved, which is a test asserting a constant back to itself.
    expect(results.map((r) => r.remaining)).toEqual(
      Array.from({ length: rule.limit }, (_, i) => rule.limit - 1 - i),
    );
    expect(results.at(-1)?.limit).toBe(rule.limit);
  });

  it("rejects the call after the limit is spent", async () => {
    const rule = RATE_LIMITS.aiProcess;

    for (let i = 0; i < rule.limit; i += 1) {
      await rateLimit(rule, "resident-1");
    }

    const denied = await rateLimit(rule, "resident-1");

    expect(denied.ok).toBe(false);
    expect(denied.remaining).toBe(0);
    // Never zero — a `Retry-After: 0` invites an immediate retry that fails.
    expect(denied.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(denied.resetAt).toBeGreaterThan(Date.now());
  });

  it("keeps counting past the limit without extending the window", async () => {
    const rule = RATE_LIMITS.aiProcess;

    for (let i = 0; i < rule.limit + 3; i += 1) {
      await rateLimit(rule, "resident-1");
    }

    const first = await rateLimit(rule, "resident-1");
    expect(first.ok).toBe(false);
    // Same fixed window throughout, so the reset does not move.
    const second = await rateLimit(rule, "resident-1");
    expect(second.resetAt).toBe(first.resetAt);
  });

  it("gives each action its own quota", async () => {
    const ai = RATE_LIMITS.aiProcess;

    for (let i = 0; i < ai.limit + 1; i += 1) {
      await rateLimit(ai, "resident-1");
    }

    expect((await rateLimit(ai, "resident-1")).ok).toBe(false);

    // Filing a report is a different rule and must be untouched by the above.
    const filing = await rateLimit(RATE_LIMITS.incidentCreate, "resident-1");
    expect(filing.ok).toBe(true);
    expect(filing.remaining).toBe(RATE_LIMITS.incidentCreate.limit - 1);

    const narrative = await rateLimit(RATE_LIMITS.reportNarrative, "resident-1");
    expect(narrative.ok).toBe(true);
    expect(narrative.limit).toBe(RATE_LIMITS.reportNarrative.limit);
  });

  it("gives each subject its own quota", async () => {
    const rule = RATE_LIMITS.aiProcess;

    for (let i = 0; i < rule.limit + 1; i += 1) {
      await rateLimit(rule, "resident-1");
    }

    // A village shares a broadband line; keying by user is the whole point.
    const neighbour = await rateLimit(rule, "resident-2");
    expect(neighbour.ok).toBe(true);
    expect(neighbour.remaining).toBe(rule.limit - 1);
  });

  it("aligns the window to a multiple of the rule's length", async () => {
    const rule = RATE_LIMITS.incidentCreate;
    await rateLimit(rule, "resident-1");

    const windowStart = mocks.queryRaw.mock.calls[0][3] as Date;

    expect(windowStart.getTime() % rule.windowMs).toBe(0);
    expect(mocks.queryRaw.mock.calls[0][1]).toBe("resident-1");
    expect(mocks.queryRaw.mock.calls[0][2]).toBe(rule.name);
  });

  it("fails open when the database is unreachable", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.queryRaw.mockRejectedValue(new Error("connection refused"));

    const result = await rateLimit(RATE_LIMITS.aiProcess, "resident-1");

    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(RATE_LIMITS.aiProcess.limit);
    // Logged loudly: a limiter that has quietly stopped limiting looks exactly
    // like one nobody is hitting.
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
  });

  it("does not touch the database when DATABASE_URL is unset", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const result = await rateLimit(RATE_LIMITS.aiProcess, "resident-1");

    expect(result.ok).toBe(true);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
});

describe("the 429 the limited routes return", () => {
  it("carries the status, Retry-After and a message the wizard can render", async () => {
    const rule = RATE_LIMITS.aiProcess;

    for (let i = 0; i < rule.limit; i += 1) {
      await rateLimit(rule, "resident-1");
    }

    const denied = await rateLimit(rule, "resident-1");
    const response = tooManyRequests(denied, "Too many rewrites for now.");

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe(
      String(denied.retryAfterSeconds),
    );
    expect(response.headers.get("X-RateLimit-Remaining")).toBe("0");

    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.code).toBe("rate_limited");
    // The wizard renders whatever is in `error`, so it has to read like a
    // sentence rather than a status line.
    expect(body.error).toContain("Too many rewrites for now.");
  });

  it("omits Retry-After on an allowed request", () => {
    const headers = rateLimitHeaders({
      ok: true,
      remaining: 4,
      limit: 5,
      resetAt: Date.now() + 60_000,
      retryAfterSeconds: 60,
    });

    expect(headers["X-RateLimit-Limit"]).toBe("5");
    expect(headers["Retry-After"]).toBeUndefined();
  });
});

describe("formatRetryAfter", () => {
  it("reads as English at every scale", () => {
    expect(formatRetryAfter(30)).toBe("in a moment");
    expect(formatRetryAfter(600)).toBe("in 10 minutes");
    expect(formatRetryAfter(3_599)).toBe("in 60 minutes");
    expect(formatRetryAfter(3_700)).toBe("in about an hour");
    expect(formatRetryAfter(4 * 3_600)).toBe("in about 4 hours");
  });
});

describe("the auth rules", () => {
  /*
    The two rules on `/api/auth/login` and `/api/auth/register` are the only
    ones keyed by address rather than by Supabase auth user id, because nobody
    is signed in yet. That makes the subject a thing this module builds rather
    than something a caller hands it, and the way it can be wrong is not subtle:
    it turns a per-caller limit into a deployment-wide one.
  */

  it("does not limit a caller whose address is unknown", () => {
    /*
      The assertion that matters. There is no proxy in front of `npm run dev`,
      so the header is simply absent — and the tempting fix, bucketing every
      unknown address under one key, would mean five sign-ins a minute for
      *everybody at once*. That is an outage wearing a rate limit's clothes, and
      it would arrive the first time this ran behind something that strips the
      header.
    */
    expect(authSubject(null)).toBeNull();
    expect(authSubject("")).toBeNull();
    expect(authSubject("   ")).toBeNull();
  });

  it("cannot collide with a Supabase auth user id", () => {
    // `user_id` holds one of those for every other rule in the table. Two kinds
    // of value in one column with nothing to tell them apart is how somebody
    // later reads the wrong one.
    const subject = authSubject("203.0.113.7");

    expect(subject).toBe("ip:203.0.113.7");
    expect(subject).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("gives signing in and registering separate windows", async () => {
    /*
      They are counted against the same subject — one address — so if they
      shared a rule name, three sign-in attempts would use up somebody's
      registrations. `rateLimit` keys on the rule name, and this exercises that
      through the mocked counter rather than by comparing the constants.
    */
    expect(RATE_LIMITS.authLogin.name).not.toBe(RATE_LIMITS.authRegister.name);

    const subject = authSubject("203.0.113.7") as string;

    for (let i = 0; i < RATE_LIMITS.authRegister.limit; i += 1) {
      expect((await rateLimit(RATE_LIMITS.authRegister, subject)).ok).toBe(true);
    }

    // Registration is spent; signing in is untouched.
    expect((await rateLimit(RATE_LIMITS.authRegister, subject)).ok).toBe(false);
    expect((await rateLimit(RATE_LIMITS.authLogin, subject)).ok).toBe(true);
  });

  it("counts two addresses separately", async () => {
    const one = authSubject("203.0.113.7") as string;
    const two = authSubject("198.51.100.4") as string;

    for (let i = 0; i < RATE_LIMITS.authLogin.limit; i += 1) {
      await rateLimit(RATE_LIMITS.authLogin, one);
    }

    expect((await rateLimit(RATE_LIMITS.authLogin, one)).ok).toBe(false);
    // A village sharing a broadband line is already a concern for a rule keyed
    // this way; two *different* connections sharing a window would make it one
    // for the whole internet.
    expect((await rateLimit(RATE_LIMITS.authLogin, two)).ok).toBe(true);
  });

  it("takes the client rather than a proxy hop out of a forwarded chain", () => {
    // Shared with the audit trail, so the address a sign-in is limited against
    // is the one the trail records. The first entry is the client.
    expect(authSubject(firstForwardedAddress("203.0.113.7, 10.0.0.1, 10.0.0.2"))).toBe(
      "ip:203.0.113.7",
    );
  });
});
