import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The two operational alerts in `src/lib/slack.ts`, and the policy in
 * `src/instrumentation.ts` that feeds the second one.
 *
 * What is worth asserting here is narrow, and none of it is wording. Three
 * things, each of which fails in a way nobody would see:
 *
 * 1. **What a server error alert is allowed to carry.** The payload Next hands
 *    `onRequestError` contains the resolved URL with its query string and the
 *    request headers — which is to say incident ids and the Supabase session
 *    cookie. Slack is a third party and a channel is retained indefinitely, so
 *    a refactor that "helpfully" passed the whole request through would be a
 *    disclosure, and it would look like an improvement in the diff. The test
 *    smuggles both in and asserts they do not come out, the way
 *    `format-social-post.test.ts` smuggles a description past a cast.
 * 2. **That control flow is not an error.** `redirect()` is a thrown error with
 *    a `NEXT_REDIRECT` digest, and `requireSession()` throws one for every
 *    signed-out visitor. Without the guard the first unauthenticated request
 *    alerts, and so does the next — an alert channel that pages on ordinary
 *    traffic is one somebody mutes, and the next real alert goes with it.
 * 3. **That a broken route does not post per request.** Same failure, one
 *    message, and the count of what it suppressed on the message after it —
 *    "no silent caps" is the police sync's rule and it applies to our own
 *    alerting most of all.
 *
 * The messages themselves are copy under revision and are deliberately not
 * asserted, for the reason `compliance-documents.test.ts` gives.
 */

const posted: string[] = [];

/** Stands in for the webhook. Returns what `notifySlack` treats as success. */
const fetchMock = vi.fn(async (_url: string, init: { body: string }) => {
  posted.push(JSON.parse(init.body).text as string);
  return { ok: true, status: 200, statusText: "OK" } as Response;
});

vi.stubGlobal("fetch", fetchMock);

/**
 * `WEBHOOK_URL` is read at module load, so the module is re-imported with the
 * environment each test wants — `auth.test.ts`'s pattern for `ADMIN_EMAILS`.
 */
async function loadSlack() {
  vi.resetModules();
  return import("@/lib/slack");
}

beforeEach(() => {
  vi.stubEnv("SLACK_WEBHOOK_URL", "https://hooks.slack.example/services/T/B/x");
  posted.length = 0;
  fetchMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("notifyCronOutcome", () => {
  it("posts a successful run as well as a failed one", async () => {
    const { notifyCronOutcome } = await loadSlack();

    await notifyCronOutcome({
      job: "/api/cron/retention",
      ok: true,
      summary: "3 archived, 3 raw wordings deleted, 0 media objects deleted",
    });

    // The success line is the whole dead-man's-switch: nothing in this
    // codebase can detect a cron that never fired, so a run that says nothing
    // when it succeeds makes silence meaningless.
    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain("/api/cron/retention");
  });

  it("distinguishes a failure from a success", async () => {
    const { notifyCronOutcome } = await loadSlack();

    await notifyCronOutcome({ job: "/api/digest", ok: true, summary: "1 village" });
    await notifyCronOutcome({ job: "/api/digest", ok: false, summary: "Error" });

    expect(posted[0]).not.toBe(posted[1]);
  });

  it("resolves rather than throwing when the webhook is refused", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Server Error",
    } as Response);

    const { notifyCronOutcome } = await loadSlack();

    // The contract the whole module rests on. A cron whose alert threw would
    // turn a completed sweep into a failed invocation — and for retention,
    // into a retry that deletes a second batch of media.
    await expect(
      notifyCronOutcome({ job: "/api/digest", ok: true, summary: "1 village" }),
    ).resolves.toEqual({ posted: false });
  });

  it("logs rather than posting when no webhook is configured", async () => {
    vi.stubEnv("SLACK_WEBHOOK_URL", "");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { notifyCronOutcome } = await loadSlack();

    await notifyCronOutcome({ job: "/api/digest", ok: true, summary: "1 village" });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("notifyServerError", () => {
  it("carries the route pattern, the method and the digest", async () => {
    const { notifyServerError } = await loadSlack();

    await notifyServerError({
      routePath: "/api/incidents/[id]/vote",
      method: "POST",
      routeType: "route",
      name: "PrismaClientKnownRequestError",
      digest: "3751028",
    });

    expect(posted[0]).toContain("/api/incidents/[id]/vote");
    expect(posted[0]).toContain("POST");
    expect(posted[0]).toContain("PrismaClientKnownRequestError");
    // The key into the platform log, which is where the message stayed.
    expect(posted[0]).toContain("3751028");
  });

  it("suppresses a repeat and says how many it swallowed", async () => {
    vi.useFakeTimers();
    const { notifyServerError, resetServerErrorAlerts } = await loadSlack();
    resetServerErrorAlerts();

    const alert = {
      routePath: "/api/incidents",
      method: "POST",
      routeType: "route",
      name: "TypeError",
    };

    await notifyServerError(alert);
    await notifyServerError(alert);
    await notifyServerError(alert);

    expect(posted).toHaveLength(1);

    // Past the window, the next one reports what it did not say at the time.
    vi.advanceTimersByTime(6 * 60_000);
    await notifyServerError(alert);

    expect(posted).toHaveLength(2);
    expect(posted[1]).toContain("2");
  });

  it("does not suppress a different error on the same route", async () => {
    const { notifyServerError, resetServerErrorAlerts } = await loadSlack();
    resetServerErrorAlerts();

    await notifyServerError({
      routePath: "/api/incidents",
      method: "POST",
      routeType: "route",
      name: "TypeError",
    });
    await notifyServerError({
      routePath: "/api/incidents",
      method: "POST",
      routeType: "route",
      name: "PrismaClientInitializationError",
    });

    // Two different faults on one route are two things to fix, and a window
    // keyed on the route alone would hide the second behind the first.
    expect(posted).toHaveLength(2);
  });
});

describe("onRequestError", () => {
  /** The payload shape Next documents, including the two unsafe fields. */
  const request = {
    // The resolved path, with an id and a query string in it.
    path: "/api/incidents/7f3a9c21-0b44-4e2e-9c1f-2a5d8e6b4c10?village=histon",
    method: "POST",
    headers: {
      cookie: "sb-access-token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.secret",
      "x-forwarded-for": "203.0.113.7",
    },
  };

  const context = {
    routerKind: "App Router" as const,
    routePath: "/api/incidents/[id]",
    routeType: "route" as const,
    renderSource: "server-rendering" as const,
    revalidateReason: undefined,
    renderType: "dynamic" as const,
  };

  async function loadHandler() {
    vi.resetModules();
    const { resetServerErrorAlerts } = await import("@/lib/slack");
    resetServerErrorAlerts();
    return (await import("@/instrumentation")).onRequestError;
  }

  it("posts nothing that identifies a resident or a session", async () => {
    const onRequestError = await loadHandler();
    const error = Object.assign(new Error("insert into users failed: joe@example.com"), {
      name: "PrismaClientKnownRequestError",
    });

    vi.spyOn(console, "error").mockImplementation(() => {});
    await onRequestError(error, request, context);

    expect(posted).toHaveLength(1);
    const message = posted[0];

    // The three things that must never cross: the session cookie, the resolved
    // path with its id and query string, and the error's own message.
    expect(message).not.toContain("sb-access-token");
    expect(message).not.toContain("7f3a9c21");
    expect(message).not.toContain("histon");
    expect(message).not.toContain("joe@example.com");
    expect(message).not.toContain("203.0.113.7");

    // What it does carry is the pattern, which is safe and is the better key.
    expect(message).toContain("/api/incidents/[id]");
    vi.mocked(console.error).mockRestore();
  });

  it("ignores redirect and not-found, which are control flow", async () => {
    const onRequestError = await loadHandler();

    // `requireSession()` throws one of these for every signed-out visitor.
    await onRequestError(
      Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307" }),
      request,
      context,
    );
    await onRequestError(
      Object.assign(new Error("not found"), { digest: "NEXT_HTTP_ERROR_FALLBACK;404" }),
      request,
      context,
    );

    expect(posted).toHaveLength(0);
  });

  it("reports a thrown value that is not an Error", async () => {
    const onRequestError = await loadHandler();
    vi.spyOn(console, "error").mockImplementation(() => {});

    // `onRequestError`'s first parameter is `unknown`, and a `throw "boom"`
    // anywhere in the tree arrives here. Narrowing it wrongly would mean the
    // alert that does not fire is the one for the sloppiest code.
    await onRequestError("boom", request, context);

    expect(posted).toHaveLength(1);
    vi.mocked(console.error).mockRestore();
  });
});
