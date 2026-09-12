import type { Instrumentation } from "next";

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
 * ## It posts to Slack, and takes on no new processor to do it
 *
 * A hosted error tracker would be better at this and is a decision with
 * paperwork behind it: a new sub-processor is a change to `/privacy` §6, to the
 * sub-processor list in **both** processing agreements and to `docs/DPIA.md`
 * §5, in the same commit. Slack is already all four of those things. What goes
 * in the message is chosen so that the §6 sentence stays short — see
 * `notifyServerError`, which is where every field is argued for.
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
    Awaited, not floated. On Vercel the instance is frozen the moment the
    response is returned, so a detached promise is not "sent later", it is
    "sometimes never sent at all" — `slack.ts` makes the same argument about the
    same call. `notifyServerError` cannot throw and cannot take more than
    `SLACK_TIMEOUT_MS`, so the cost is bounded; and this runs after the response
    has already failed, so there is no successful request being held up.
  */
  await notifyServerError({
    routePath: context.routePath,
    method: request.method,
    routeType: context.routeType,
    name: error instanceof Error ? error.name : typeof error,
    digest,
  });
};
