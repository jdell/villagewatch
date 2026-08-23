import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { RATE_LIMIT_RETENTION_DAYS } from "@/lib/constants";

/**
 * Fixed-window rate limiting, counted in Postgres. **Server only.**
 *
 * Three call sites cost real money per call — `POST /api/incidents/process` and
 * the report narrative on `/reports` both spend Anthropic credit, and
 * `POST /api/incidents` writes a report that a coordinator then has to read —
 * and this is the brake on all three.
 *
 * ## Why this is not a `Map` any more
 *
 * It was, until now, and on Vercel that meant the limits were not limits. The
 * counters lived in the lambda: two concurrent instances each allowed a full
 * quota, and a cold start reset every counter to zero. An idle deployment
 * therefore handed a fresh quota to whoever woke it up, which is precisely the
 * caller worth limiting. The comment where that store used to be said shared
 * state was the fix and that every call site could stay the same. Both were
 * right — the `rate_limit` table is the shared state, and the only change
 * upstream is an `await`.
 *
 * ## How a window is counted
 *
 * `windowStart` is aligned to a multiple of the rule's length rather than set
 * from the first call in the window. Two things follow, and both matter:
 *
 * - Every instance handling the same caller computes the same `windowStart`
 *   from the clock alone, with nothing to agree on and no read before the write.
 * - The unique constraint on `(userId, action, windowStart)` can then carry the
 *   whole operation, as a single `INSERT ... ON CONFLICT DO UPDATE`. Two
 *   concurrent requests cannot both read 4 and both write 5, which a
 *   read-then-write — including Prisma's own `upsert`, which is two statements
 *   when it cannot prove otherwise — would allow.
 *
 * Fixed windows, not sliding: a caller can spend their whole quota at the end of
 * one window and again at the start of the next. For a limit of 5 an hour that
 * is 10 calls in a minute, worst case. That was an acceptable imprecision when
 * this was a counter with no dependencies and it still is — the thing being
 * defended against is a retry loop and a hammered "Reprocess" button, not a
 * caller pacing themselves against a window boundary.
 *
 * ## What happens when the database is unreachable
 *
 * It **fails open**, and that is a deliberate ranking of two failure modes. A
 * limiter that fails closed would turn a database blip into "you cannot file a
 * report", and being rate limited must never block filing (see
 * `RATE_LIMITS.aiProcess`, and the fallback in `incident-form.tsx`). The two
 * limited routes both need the database for their real work anyway, so a failure
 * here does not open a path that stays open — it just declines to be the thing
 * that reports the outage.
 */

export type RateLimitRule = {
  /** Namespace, so two rules never share a window for the same subject. */
  name: string;
  limit: number;
  windowMs: number;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * The limits, in one place so they can be read without opening a route.
 *
 * Both are per resident, not per IP: a village shares a broadband line often
 * enough that an IP-keyed limit would silence a household because a neighbour
 * filed first. Every limited route already requires a session, so there is
 * always a user id to key on.
 */
export const RATE_LIMITS = {
  /**
   * The AI pass. Five is roughly two full reports with a reprocess each — past
   * that the model is not the problem, and the reporter can still file using
   * their own wording, which the wizard falls back to anyway.
   */
  aiProcess: { name: "ai-process", limit: 5, windowMs: HOUR_MS },

  /**
   * Filing a report. Ten a day is far above what a real resident files and far
   * below what it takes to bury a coordinator's queue.
   */
  incidentCreate: { name: "incident-create", limit: 10, windowMs: DAY_MS },

  /**
   * The community safety report's narrative.
   *
   * The most expensive single call in the app — a month of a village's reports
   * goes into the prompt — and the only one a *coordinator* can trigger by
   * hand, repeatedly, from a button. Twelve an hour is far above regenerating a
   * report a few times while adjusting the dates and far below what a stuck
   * retry loop would spend. The rest of the report is counted from the database
   * and is unaffected: being limited here costs the prose, not the document.
   */
  reportNarrative: { name: "report-narrative", limit: 12, windowMs: HOUR_MS },

  /**
   * Changing your vote on one report.
   *
   * The odd one out in this table twice over, and both are worth reading before
   * copying its shape.
   *
   * **It is scoped to one incident**, through {@link incidentVoteRule}, which is
   * what "one change per report per ten seconds" actually needs — a per-resident
   * limit would mean voting on the second report in a list was refused because
   * you had just voted on the first, which is the normal way somebody reads a
   * page of reports. The scoping goes in the rule *name* rather than the
   * subject, so `user_id` stays a Supabase auth user id everywhere in this table
   * and the `action` column keeps saying what was limited.
   *
   * **What it defends against is not cost.** A vote is one small write; nothing
   * here spends Anthropic credit or a coordinator's attention. It is the toggle:
   * up, down, up, down is four rows' worth of churn from one finger, and the
   * button is the only control in the app whose *repeated* press is meaningful
   * rather than accidental. Ten seconds is long enough that a held button
   * achieves nothing and short enough that changing your mind after reading the
   * description is not refused.
   *
   * A limit of 1 with a fixed window means the worst case is two changes a few
   * milliseconds apart, at a window boundary — see the header on fixed windows.
   * That is an acceptable imprecision here for the same reason it is everywhere
   * else in this file: the thing being defended against is a stuck finger, not a
   * caller pacing themselves against the clock.
   */
  incidentVote: { name: "incident-vote", limit: 1, windowMs: 10_000 },
} as const satisfies Record<string, RateLimitRule>;

/**
 * The vote rule for one report.
 *
 * The window and the limit come from `RATE_LIMITS.incidentVote`; only the
 * namespace moves. Old windows are swept nightly at `RATE_LIMIT_RETENTION_DAYS`
 * like every other row here, so the per-incident cardinality is bounded by a
 * week of votes rather than growing forever.
 */
export function incidentVoteRule(incidentId: string): RateLimitRule {
  return {
    ...RATE_LIMITS.incidentVote,
    name: `${RATE_LIMITS.incidentVote.name}:${incidentId}`,
  };
}

export type RateLimitResult = {
  ok: boolean;
  /** Calls left in this window. Zero when `ok` is false. */
  remaining: number;
  limit: number;
  /** Epoch ms when the window resets. */
  resetAt: number;
  /** Whole seconds until the reset, for the `Retry-After` header. */
  retryAfterSeconds: number;
};

/** Start of the fixed window `now` falls in, aligned to the rule's length. */
function windowStartFor(rule: RateLimitRule, now: number): Date {
  return new Date(Math.floor(now / rule.windowMs) * rule.windowMs);
}

function allow(rule: RateLimitRule, resetAt: number, now: number): RateLimitResult {
  return {
    ok: true,
    remaining: rule.limit,
    limit: rule.limit,
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

/**
 * Counts one call against `subject`'s quota for `rule` and says whether it is
 * allowed.
 *
 * Consumes on every call, including the ones it rejects — a caller that keeps
 * hammering a closed window does not extend it, but neither do they get a free
 * probe. `subject` should be the Supabase auth user id.
 *
 * Async now that the counter is a row rather than a map entry. Both call sites
 * already sat in `async` handlers, so the only change there is the `await`.
 */
export async function rateLimit(
  rule: RateLimitRule,
  subject: string,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = windowStartFor(rule, now);
  const resetAt = windowStart.getTime() + rule.windowMs;

  // Nothing to count against, and nothing the caller could do about it.
  if (!process.env.DATABASE_URL) return allow(rule, resetAt, now);

  let count: number;

  try {
    // One statement, so the increment is atomic under concurrency. Raw rather
    // than `prisma.upsert` because the upsert is a read and a write that two
    // requests can interleave between; `ON CONFLICT DO UPDATE` cannot be.
    //
    // `count` is qualified as `rate_limit.count` in the update: unqualified it
    // would resolve to the column being assigned, not the stored value.
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "rate_limit" ("id", "user_id", "action", "window_start", "count")
      VALUES (gen_random_uuid(), ${subject}, ${rule.name}, ${windowStart}, 1)
      ON CONFLICT ("user_id", "action", "window_start")
      DO UPDATE SET "count" = "rate_limit"."count" + 1
      RETURNING "count"
    `;

    count = rows[0]?.count ?? 1;
  } catch (cause) {
    // Fails open — see the header. Logged loudly, because a limiter that has
    // quietly stopped limiting looks exactly like one nobody is hitting.
    console.error(
      "Rate limit check failed for %s on %s; allowing the request",
      subject,
      rule.name,
      cause,
    );

    return allow(rule, resetAt, now);
  }

  return {
    ok: count <= rule.limit,
    remaining: Math.max(0, rule.limit - count),
    limit: rule.limit,
    resetAt,
    // Rounded up: a `Retry-After: 0` invites an immediate retry that would
    // fail again.
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt - now) / 1000)),
  };
}

/**
 * Drops counters whose window closed more than `RATE_LIMIT_RETENTION_DAYS` ago.
 *
 * Called by the nightly retention sweep. Without it this table grows by one row
 * per resident per rule per window forever — not a privacy problem, because a
 * row holds an auth user id, an action name and a number and says nothing about
 * what was reported, but the one table in the schema with no natural ceiling.
 *
 * The margin is deliberately generous. Deleting a window merely because it has
 * closed would race a request still counting against it, and a resident whose
 * daily limit silently reset mid-sweep is a worse outcome than a week of rows
 * nobody reads.
 */
export async function deleteExpiredRateLimits(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - RATE_LIMIT_RETENTION_DAYS * DAY_MS);

  const { count } = await prisma.rateLimit.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });

  return count;
}

/** Headers describing the quota. Sent on the allowed responses too. */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
  };

  if (!result.ok) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }

  return headers;
}

/** "in 4 minutes", "in about 2 hours" — for the message a resident reads. */
export function formatRetryAfter(seconds: number): string {
  if (seconds < 90) return "in a moment";
  if (seconds < 60 * 60) return `in ${Math.ceil(seconds / 60)} minutes`;

  const hours = Math.round(seconds / 3600);
  return hours <= 1 ? "in about an hour" : `in about ${hours} hours`;
}

/**
 * The 429 both limited routes return.
 *
 * `error` rather than a bare status text because the report wizard renders
 * whatever comes back in `error` — see the fallback path in
 * `incident-form.tsx`, which treats any non-200 from the AI route as "no
 * rewrite this time" and keeps the reporter's own wording. Being rate limited
 * should read like that, not like a crash.
 */
export function tooManyRequests(
  result: RateLimitResult,
  message: string,
): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      code: "rate_limited",
      error: `${message} Try again ${formatRetryAfter(result.retryAfterSeconds)}.`,
      retryAfterSeconds: result.retryAfterSeconds,
    },
    { status: 429, headers: rateLimitHeaders(result) },
  );
}
