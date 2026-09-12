import type { Instrumentation } from "next";
import * as Sentry from "@sentry/nextjs";

import { notifyServerError } from "@/lib/slack";

/**
 * Server-side error capture.
 *
 * Next calls `onRequestError` for every error its server catches — a Route
 * Handler that threw, a Server Component that failed to render, a server action
 * that blew up. This is the half of the story the three `error.tsx` boundaries
 * structurally cannot tell: those are Client Components, so the `console.error`
 * in each of them runs in the **resident's** browser and reaches nobody. See
 * "The error boundaries" in CLAUDE.md, where that limit is now written down
 * rather than papered over.
 *
 * Read `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`
 * before changing anything here.
 *
 * ## Two destinations, and they are not redundant
 *
 * This file used to say that a hosted error tracker "would be better at this
 * and is a decision with paperwork behind it". The decision has been taken and
 * the paperwork done — Sentry is named in `/privacy` §6, in the sub-processor
 * list of **both** processing agreements and in `docs/DPIA.md` §5 — so both now
 * run, and the split is deliberate rather than transitional:
 *
 * - **Sentry gets the error.** The message, the stack, the release, grouping
 *   and a history. That is what makes a bug diagnosable and it is the reason to
 *   take on a processor at all. Everything about what may reach it is argued
 *   for in `src/lib/sentry-scrub.ts`.
 * - **Slack gets a line.** A class name and a route pattern, structurally
 *   incapable of carrying more. It is the surface somebody actually watches —
 *   the same channel the four crons report to — and it is what still works when
 *   the Sentry project is over quota, unreachable, or has not been created yet.
 *
 * Neither is the other's fallback. Dropping the Slack line the day Sentry was
 * wired in would have moved every signal into a tab nobody has open; dropping
 * Sentry would leave the signal with nothing behind it to diagnose from.
 *
 * ## Two guards, and the first one is not optional
 *
 * `redirect()` and `notFound()` are control flow implemented as thrown errors.
 * `requireSession()` bounces every signed-out visitor with one, so without the
 * digest guard below the first unauthenticated request would alert, and the
 * next, and the next. CLAUDE.md already records that these never reach the
 * `error.tsx` boundaries; this file sits lower and does not get to assume the
 * same filtering, so it checks. `NEXT_REDIRECT` and `NEXT_HTTP_ERROR_FALLBACK`
 * are the two prefixes this version of Next actually uses — grepped out of
 * `node_modules/next/dist` rather than remembered.
 *
 * The second guard is the repeat window inside `notifyServerError`. A route
 * that throws throws on every retry too, and an alert channel that posts a
 * thousand times is a channel somebody mutes.
 */

/**
 * Loads the Sentry config for whichever runtime this is.
 *
 * Next calls `register()` once per runtime at startup. **Nothing
 * auto-discovers `sentry.server.config.ts` or `sentry.edge.config.ts`** — older
 * SDK versions looked for them by name and v10 does not, so these two imports
 * are the only thing loading them. Rename either file and the symptom is a
 * runtime that reports nothing, with no error to say so.
 *
 * Dynamic imports, not top-level ones: the edge bundle must not pull in the
 * Node config, which reaches for APIs the edge runtime does not have.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

/** Digest prefixes Next uses for control flow rather than for failures. */
const CONTROL_FLOW_DIGEST = /^NEXT_/;

function digestOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return undefined;
  }

  const { digest } = error as { digest?: unknown };

  return typeof digest === "string" ? digest : undefined;
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const digest = digestOf(error);

  if (digest && CONTROL_FLOW_DIGEST.test(digest)) return;

  /*
    The platform log gets the whole thing, including the message and the stack.
    That is the half an operator needs and the half that cannot go to a third
    party — see `notifyServerError` for why. `digest` is what joins the two.
  */
  console.error(
    "Server error in %s %s (%s)",
    request.method,
    context.routePath,
    context.routeType,
    error,
  );

  /*
    Sentry first, and given the whole error rather than a summary of it — the
    message and the stack are the point of it, and `beforeSend` in
    `src/lib/sentry-scrub.ts` is what decides what travels with them.

    `captureRequestError` rather than `captureException`: it is the SDK's own
    hook for this signature and it attaches the request and routing context
    Next hands us, which a bare capture would drop on the floor.
  */
  Sentry.captureRequestError(error, request, context);

  /*
    Then the line somebody actually sees. Awaited, not floated: on Vercel the
    instance is frozen the moment the response is returned, so a detached
    promise is not "sent later", it is "sometimes never sent at all" —
    `slack.ts` makes the same argument about the same call. `notifyServerError`
    cannot throw and cannot take more than `SLACK_TIMEOUT_MS`, so the cost is
    bounded; and this runs after the response has already failed, so there is no
    successful request being held up.
  */
  await notifyServerError({
    routePath: context.routePath,
    method: request.method,
    routeType: context.routeType,
    name: error instanceof Error ? error.name : typeof error,
    digest,
  });
};
