import type { ErrorEvent } from "@sentry/nextjs";

/**
 * What is allowed to leave for Sentry.
 *
 * **Read this before changing a `Sentry.init` option.** Sentry is a processor
 * holding error reports from a service whose whole subject matter is residents
 * reporting on their neighbours, and the three `sentry.*.config.ts` files all
 * route through `scrubEvent` for that reason: one place to argue about, one
 * place to change, and a unit test in front of it
 * (`tests/sentry-scrub.test.ts`).
 *
 * ## The thing to be honest about first
 *
 * An error tracker exists to capture messages and stack traces, and **a message
 * can contain anything the code put in it**. A Prisma error quotes the row that
 * broke a constraint; a Zod failure quotes the input. So unlike
 * `notifyServerError` in `src/lib/slack.ts` — which sends a class name and a
 * route pattern and structurally cannot send more — this pipe *can* carry a
 * resident's words, and no `beforeSend` can promise otherwise without reading
 * English.
 *
 * That is the trade being made rather than a hole to be plugged: an error
 * tracker that dropped messages would not be an error tracker. What this module
 * does is remove everything else, so the only route by which resident data
 * reaches Sentry is an exception message that happens to quote it — and
 * `/privacy` §6 says so in as many words rather than implying a guarantee that
 * is not there.
 *
 * ## What is removed, and why each one
 *
 * - **Cookies.** `sb-access-token` is a live Supabase session. An access token
 *   in an error report is an account handed to anybody who can read the issue.
 *   This is the single most important line in the file.
 * - **`authorization`, and every header not on the allow-list.** Listing what
 *   may stay rather than what must go is the rule `rls_policies.sql` follows
 *   for column grants, and for its reason: a header added by a future proxy is
 *   withheld until somebody thinks about it, rather than shipped by default.
 * - **Query strings.** `/register?code=ABC123` carries a village's join code,
 *   and `?village=` and `?site=` carry ids. The path is kept because it is what
 *   makes an issue findable.
 * - **Request bodies.** A `POST /api/incidents` body is the reporter's verbatim
 *   words — domain rule 1, and the one thing in the schema that must not travel.
 * - **User context.** Not scrubbed but never *set*: nothing in this codebase
 *   calls `Sentry.setUser`. A Supabase auth user id is pseudonymous rather than
 *   anonymous, it is the join key to everything a resident has ever filed, and
 *   "which resident hit this" is a question a coordinator can answer from the
 *   audit trail without it being in a third party's issue tracker.
 *
 * ## What is deliberately *not* switched on
 *
 * **Session Replay**, which the Sentry setup wizard adds by default and which
 * would be the worst feature in this codebase. It records the DOM — so on
 * `/dashboard/queue` it would record a coordinator reading a resident's
 * unedited account of their neighbours, and ship it to Frankfurt. Masking is
 * opt-out and one unmasked selector away from being wrong. It is not enabled,
 * and this paragraph is here so that turning it on has to be a decision
 * somebody argues for.
 *
 * **Performance tracing** is off by default (`SENTRY_TRACES_SAMPLE_RATE`
 * unset means 0) for a smaller reason: a transaction name carries the route and
 * the sampling costs quota, and neither is a question this deployment has yet.
 */

/**
 * Headers that may travel with an error report.
 *
 * An allow-list, not a deny-list. Everything here is either set by us or is a
 * property of the request rather than of the person making it — and `cookie`,
 * `authorization` and `x-forwarded-for` are absent by construction rather than
 * by being remembered.
 */
const ALLOWED_HEADERS = new Set([
  "accept",
  "accept-encoding",
  "accept-language",
  "content-type",
  "referer",
  "user-agent",
]);

/** Strips the query string, keeping the path that makes an issue findable. */
function pathOnly(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * The `beforeSend` every runtime shares.
 *
 * Returns the event to send it, or `null` to drop it entirely. It never
 * throws: a `beforeSend` that threw would take out the reporting of the error
 * it was called for, which is the one moment it must not.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  try {
    const request = event.request;

    if (request) {
      // The whole body, whatever shape it arrived in.
      delete request.data;
      delete request.cookies;
      delete request.query_string;

      if (typeof request.url === "string") {
        request.url = pathOnly(request.url);
      }

      if (request.headers) {
        const kept: Record<string, string> = {};

        for (const [name, value] of Object.entries(request.headers)) {
          if (ALLOWED_HEADERS.has(name.toLowerCase()) && typeof value === "string") {
            kept[name] = value;
          }
        }

        request.headers = kept;
      }
    }

    /*
      Nothing sets user context, so this is a backstop rather than a cleanup:
      `sendDefaultPii: false` already stops the SDK inferring a user from an IP
      or a cookie, and if a future call site adds `Sentry.setUser` deliberately
      it should have to come through this file to do it.
    */
    delete event.user;

    return event;
  } catch {
    /*
      Returning the event unscrubbed would be the wrong failure: this function
      exists precisely because the unscrubbed event is not safe to send. An
      error here is a bug in the scrubber, and losing one report to it is
      cheaper than sending one with a session cookie in it.

      It cannot simply return `null` either — the signature is non-nullable so
      callers cannot accidentally drop everything — so it returns an event
      stripped of the parts that carry anything.
    */
    return { ...event, request: undefined, user: undefined };
  }
}

/**
 * The DSN, and the two names it can arrive under.
 *
 * The browser bundle can only read `NEXT_PUBLIC_SENTRY_DSN` — it is inlined at
 * build time, which is the same trap `NEXT_PUBLIC_ONESIGNAL_APP_ID` already
 * has: **setting it in Vercel without redeploying looks exactly like setting
 * it.** The server can read either, so it prefers the private name and falls
 * back, which means a deployment that sets only the public one still reports
 * from both sides.
 *
 * **An unset DSN disables the SDK rather than erroring**, which is the property
 * every other integration here has — Slack, OneSignal and Resend all log
 * instead of sending. It is what lets a fresh clone run the build, the lint and
 * the suite with no environment at all.
 */
export const SENTRY_DSN =
  process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN || undefined;

/**
 * Tracing is opt-in and off by default.
 *
 * Parsed rather than passed through: a malformed value silently becoming `NaN`
 * would be read by the SDK as "sample nothing" on one release and "sample
 * everything" on the next, and the second one is a bill.
 */
export function tracesSampleRate(): number {
  const raw = Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "");

  if (!Number.isFinite(raw) || raw < 0) return 0;

  return Math.min(raw, 1);
}

/**
 * `development` on a laptop, `preview` on a Vercel preview, `production` on the
 * real thing — so an error from somebody's `npm run dev` does not page anyone
 * looking at the production issue stream.
 */
export const SENTRY_ENVIRONMENT =
  process.env.SENTRY_ENVIRONMENT ||
  process.env.NEXT_PUBLIC_VERCEL_ENV ||
  process.env.VERCEL_ENV ||
  process.env.NODE_ENV ||
  "development";
