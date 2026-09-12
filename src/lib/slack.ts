/**
 * Operational alerts to a Slack channel.
 *
 * **Server only**, and deliberately the smallest thing that works: one webhook
 * URL, one function, a plain `fetch` POST. No SDK — the Slack SDK exists to
 * manage tokens, retries and the Web API, and an incoming webhook is a URL you
 * post JSON to.
 *
 * This is a **staff channel, not a product surface.** It tells the people
 * running the deployment that something happened; residents never see it and
 * nothing in the app depends on it. That distinction is what makes the
 * error handling below correct rather than lazy.
 *
 * ## Nothing throws, and nothing waits long
 *
 * Same contract as `notifications.ts` and `whatsapp-channel.ts`: an
 * unconfigured webhook, a timeout and a 500 from Slack all log and return. A
 * resident's registration must not fail because a staff channel was
 * unreachable, and a coordinator's Approve click must not hang on it.
 *
 * Callers `await` this rather than leaving a floating promise. That looks like
 * the opposite of fire-and-forget and is the same thing: on Vercel the function
 * instance is frozen the moment the response is returned, so a detached promise
 * is not "sent later", it is "sometimes never sent at all". Awaiting a call that
 * cannot throw and cannot take more than {@link SLACK_TIMEOUT_MS} buys delivery
 * for a bounded cost.
 *
 * ## What may go in a message
 *
 * Read this before adding a call site. Slack is a third party, outside the UK,
 * and a message is retained in a channel indefinitely and readable by everyone
 * in it. `/privacy` §6 names this disclosure, so what goes in these strings is
 * a claim that document makes.
 *
 * - **Never `Incident.rawDescription`.** Domain rule 1 does not stop at the
 *   village boundary, and the whole point of the anonymised `description` is
 *   that it is the version safe to move around.
 * - **Never coordinates.** `locationText` is the anonymised landmark and is the
 *   only location that belongs here.
 * - A resident's name and email do appear, on registration and on a coordinator
 *   application. Those are the two events where the staff running a deployment
 *   need to know who — and they are named in the privacy notice for it.
 */

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? "";

export const isSlackConfigured = WEBHOOK_URL.length > 0;

/**
 * How long to wait on Slack before giving up.
 *
 * Short, because a resident or a coordinator is usually waiting on the response
 * this call is holding up. Three seconds is generous for a webhook that
 * normally answers in tens of milliseconds, and unnoticeable when it does not.
 */
const SLACK_TIMEOUT_MS = 3_000;

/**
 * Posts one line to the configured Slack channel.
 *
 * Resolves either way — check the return value only if you have something
 * useful to do with it, which so far nobody does.
 */
export async function notifySlack(text: string): Promise<{ posted: boolean }> {
  if (!isSlackConfigured) {
    // Logged rather than dropped silently: on a deployment with no webhook this
    // is the only record that the event happened, and in development it is how
    // you check the wording without creating a Slack app.
    console.log("[slack:not-configured] %s", text);
    return { posted: false };
  }

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `text` is the whole payload. Slack renders it with mrkdwn, which is why
      // the call sites use plain sentences and a leading emoji rather than
      // blocks — a block kit payload is a schema to maintain for a staff alert
      // nobody is going to click.
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(
        "Slack webhook rejected a message: %d %s",
        response.status,
        response.statusText,
      );
      return { posted: false };
    }

    return { posted: true };
  } catch (cause) {
    // Covers the timeout, DNS failure and a revoked webhook alike. None of them
    // is worth failing a resident's request over.
    console.warn("Could not post to Slack", cause);
    return { posted: false };
  }
}

// ---------------------------------------------------------------------------
// Operational alerts
// ---------------------------------------------------------------------------

/**
 * The two alerts below are about the *service* rather than about a village, and
 * they are the reason this file now has a second half.
 *
 * Everything above reports something a person did — somebody registered, a
 * coordinator published a report. Nothing reported anything that **failed**, so
 * a scheduled job that stopped running produced no message anywhere, and a 500
 * on a route reached a Vercel function log nobody is watching. The retention
 * sweep is the one that makes this urgent rather than tidy: it enforces the
 * deletion schedule `/privacy` §7 promises residents, and a promise that stops
 * being kept in silence is the worst shape a failure can take here.
 *
 * ## They carry no personal data at all, and that is a design constraint
 *
 * The rule at the top of this file is about what a message *may* carry. These
 * two carry nothing: counts, a job name and a route pattern. That is not
 * caution for its own sake — it is what lets `/privacy` §6 describe them in one
 * sentence that says "nothing about you", rather than widening a disclosure a
 * resident has already read and agreed to.
 *
 * The split that makes that affordable is **detail to the server log, signal to
 * Slack**. Every call site still logs the exact `cause` where an operator can
 * read it; what crosses to a third party is the fact that something failed and
 * enough to go and find it. It is the division `auth-errors.ts` already makes
 * for a different audience — the provider's own wording goes to the log, and a
 * constant goes to the person.
 */

/**
 * One scheduled job's outcome.
 *
 * **A successful run posts too, and that is the point rather than noise.**
 * Nothing in this repository can detect a cron that never fired — Vercel does
 * not tell us, and a job that silently stops looks exactly like a job with
 * nothing to do. A short line on every run is what makes the *absence* of one
 * mean something, which is the cheapest dead-man's-switch available without
 * taking on a new processor. Four jobs at their schedules is roughly two
 * messages a day.
 *
 * `summary` is built by the caller from its own counts, so it is a string this
 * codebase wrote rather than one it received. Pass figures; never a report's
 * contents and never an error's message.
 */
export async function notifyCronOutcome(input: {
  /** The job's path, as it appears in `vercel.json`. */
  job: string;
  ok: boolean;
  /** Counts, built by the caller. Never an error message. */
  summary: string;
}): Promise<{ posted: boolean }> {
  const icon = input.ok ? "OK" : "FAILED";

  return notifySlack(`[cron ${icon}] ${input.job} — ${input.summary}`);
}

/**
 * How long one route-and-error pairing stays quiet after being reported.
 *
 * A route that throws on every request throws on every *retry* too, and a
 * browser retries. Without this the first broken deploy would post a message
 * per request until somebody muted the channel — which is how a channel stops
 * being read, and the next real alert goes with it.
 */
const ERROR_ALERT_WINDOW_MS = 5 * 60_000;

/**
 * How many distinct route-and-error pairings to remember at once.
 *
 * Bounded because this is a module-level map in a long-lived server process.
 * The key space is finite by construction — routes times error names — so the
 * cap is a backstop against something generating names dynamically rather than
 * a ceiling anybody should reach.
 */
const ERROR_ALERT_MAX_KEYS = 200;

type ErrorAlertWindow = { until: number; suppressed: number };

/**
 * **This is a module variable, and `rate-limit.ts` spends several paragraphs
 * explaining that a module variable is the wrong shape for a limiter.** It is
 * the right shape here, for the reason `police-api.ts`'s outbound pacer gives.
 * That file is a *security* limit on an *inbound* request, where per-instance
 * counters meant a caller who could trigger scale-out got a multiple of the
 * quota. This is noise suppression on our own outbound alerting, with no
 * adversary to outwit: the worst a fleet of instances can do is post the same
 * alert once each, which is a handful of messages rather than thousands. And
 * putting a Postgres round trip in front of an error report would mean the
 * database being down is the thing that stops us being told the database is
 * down.
 */
const errorAlertWindows = new Map<string, ErrorAlertWindow>();

/**
 * A server-side error, from `src/instrumentation.ts`.
 *
 * **Every field here was chosen against what it could carry**, which is worth
 * reading before adding another:
 *
 * - **`routePath`, never `request.path`.** Next gives both: the first is the
 *   route file's pattern (`/api/incidents/[id]/vote`) and the second is the
 *   resolved resource path *including the query string* — so it carries
 *   incident ids, village ids and whatever a form put in a URL. The pattern is
 *   also the better key: it groups every failure of one route together instead
 *   of splitting them by id.
 * - **Never `request.headers`.** They carry the Supabase session cookie. An
 *   access token in a channel retained indefinitely is a session handed to
 *   everybody in it.
 * - **Never `error.message`.** Next replaces the message with a generic string
 *   for errors forwarded from Server Components, but a Route Handler throwing a
 *   Prisma error is not that: the message can quote the row that broke a
 *   constraint, which is a resident's data, and a connection failure can quote
 *   the connection string. The full error is in the platform log and `digest`
 *   is the key into it — which is what Next's own documentation describes the
 *   digest as being for.
 * - **`name` rather than the message.** `PrismaClientKnownRequestError` says
 *   what kind of thing broke, out of a vocabulary of class names, without
 *   quoting anything a resident wrote.
 */
export async function notifyServerError(input: {
  /** `context.routePath` — the pattern, never the resolved URL. */
  routePath: string;
  method: string;
  /** `context.routeType` — render, route, action or proxy. */
  routeType: string;
  /** The error's constructor name. Never its message. */
  name: string;
  /** Next's hash, which matches the entry in the platform log. */
  digest?: string;
}): Promise<{ posted: boolean }> {
  const key = `${input.routePath} ${input.name}`;
  const now = Date.now();
  const open = errorAlertWindows.get(key);

  if (open && now < open.until) {
    open.suppressed += 1;
    return { posted: false };
  }

  /*
    "No silent caps" is the police sync's rule and it applies to our own
    alerting too: a window that swallowed a hundred repeats and never said so
    would understate an outage to the one channel meant to reveal it. The count
    rides on the next message the pairing earns.
  */
  const repeats = open?.suppressed ?? 0;

  if (errorAlertWindows.size >= ERROR_ALERT_MAX_KEYS) {
    for (const [candidate, window] of errorAlertWindows) {
      if (now >= window.until) errorAlertWindows.delete(candidate);
    }

    // Still full: every window is live, which is a genuine storm across many
    // routes. Drop the longest-standing rather than grow without bound — a Map
    // iterates in insertion order, so the first key is the oldest.
    if (errorAlertWindows.size >= ERROR_ALERT_MAX_KEYS) {
      const oldest = errorAlertWindows.keys().next();
      if (!oldest.done) errorAlertWindows.delete(oldest.value);
    }
  }

  errorAlertWindows.set(key, {
    until: now + ERROR_ALERT_WINDOW_MS,
    suppressed: 0,
  });

  const parts = [
    `[error] ${input.name} in ${input.method} ${input.routePath}`,
    `(${input.routeType})`,
  ];

  if (input.digest) parts.push(`digest ${input.digest}`);
  if (repeats > 0) parts.push(`- ${repeats} more since the last alert`);

  return notifySlack(parts.join(" "));
}

/**
 * Test seam. The window map is module state, so a test asserting the
 * suppression would otherwise depend on the order the tests ran in.
 */
export function resetServerErrorAlerts(): void {
  errorAlertWindows.clear();
}
