import { NextResponse } from "next/server";

/**
 * In-memory fixed-window rate limiting. **Server only.**
 *
 * Two routes cost real money per call — `POST /api/incidents/process` spends
 * Anthropic credit and `POST /api/incidents` writes a report that a coordinator
 * then has to read — and until now neither was metered. This is the brake.
 *
 * ## What this is not
 *
 * The counters live in the process. On Vercel that means **per lambda
 * instance**: two concurrent instances each allow a full quota, and a cold
 * start resets to zero. A determined caller who can trigger scale-out gets a
 * multiple of the stated limit.
 *
 * That is a real limitation and it is still worth having. The thing being
 * defended against is a stuck retry loop or one resident hammering
 * "Reprocess" — both of which come from a single client, land on a warm
 * instance, and stop dead here. Defending against a distributed attacker needs
 * shared state (Upstash, Supabase, Vercel KV); when that arrives, replace the
 * `Map` below and leave every call site alone.
 *
 * Fixed windows, not sliding: a caller can spend their whole quota at the end
 * of one window and again at the start of the next. For a limit of 5 an hour
 * that is 10 calls in a minute, worst case, which is the level of imprecision
 * worth accepting for a counter with no dependencies.
 */

type Bucket = {
  count: number;
  /** Epoch ms at which this window ends and the count resets. */
  resetAt: number;
};

export type RateLimitRule = {
  /** Namespace, so two rules never share a bucket for the same subject. */
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
} as const satisfies Record<string, RateLimitRule>;

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

/** Sweep expired buckets at most this often, and whenever the map gets big. */
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const SWEEP_THRESHOLD = 5_000;

type Store = { buckets: Map<string, Bucket>; lastSweep: number };

// Survives hot reloads in dev for the same reason the Prisma client does —
// otherwise every save hands the caller a fresh, empty quota.
const globalForRateLimit = globalThis as unknown as {
  vwRateLimit: Store | undefined;
};

const store: Store = (globalForRateLimit.vwRateLimit ??= {
  buckets: new Map(),
  lastSweep: 0,
});

/**
 * Drops windows that have already closed.
 *
 * Without this the map grows one entry per user per rule for the life of the
 * process. Sweeping on write rather than on a timer keeps this module free of
 * anything that would hold a serverless instance open.
 */
function sweep(now: number) {
  if (now - store.lastSweep < SWEEP_INTERVAL_MS && store.buckets.size < SWEEP_THRESHOLD) {
    return;
  }

  for (const [key, bucket] of store.buckets) {
    if (bucket.resetAt <= now) store.buckets.delete(key);
  }

  store.lastSweep = now;
}

/**
 * Counts one call against `subject`'s quota for `rule` and says whether it is
 * allowed.
 *
 * Consumes on every call, including the ones it rejects — a caller that keeps
 * hammering a closed window does not extend it, but neither do they get a free
 * probe. `subject` should be the Supabase auth user id.
 */
export function rateLimit(rule: RateLimitRule, subject: string): RateLimitResult {
  const now = Date.now();
  sweep(now);

  const key = `${rule.name}:${subject}`;
  const existing = store.buckets.get(key);

  const bucket: Bucket =
    existing && existing.resetAt > now
      ? existing
      : { count: 0, resetAt: now + rule.windowMs };

  bucket.count += 1;
  store.buckets.set(key, bucket);

  const allowed = bucket.count <= rule.limit;

  return {
    ok: allowed,
    remaining: Math.max(0, rule.limit - bucket.count),
    limit: rule.limit,
    resetAt: bucket.resetAt,
    // Rounded up: a `Retry-After: 0` invites an immediate retry that would
    // fail again.
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
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
