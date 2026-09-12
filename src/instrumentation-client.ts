import * as Sentry from "@sentry/nextjs";

import { SENTRY_ENVIRONMENT, scrubEvent, tracesSampleRate } from "@/lib/sentry-scrub";

/**
 * Sentry, browser.
 *
 * **This file is `instrumentation-client.ts` and not `sentry.client.config.ts`,
 * and that is not a preference.** The SDK still reads the older name under
 * webpack and prints a deprecation warning; under **Turbopack it does not read
 * it at all**, and this project builds and develops with Turbopack. A
 * `sentry.client.config.ts` here would sit in the repository looking correct,
 * pass every check, and report nothing from a single browser — the same shape
 * of silent failure as an analytics origin missing from the CSP. Checked
 * against the warning in `node_modules/@sentry/nextjs/build/cjs/config/webpack.js`
 * rather than remembered.
 *
 * `src/instrumentation-client.ts` is a Next file convention in its own right,
 * which is why it sits beside `src/instrumentation.ts` rather than at the root
 * with the server and edge configs.
 */
Sentry.init({
  /**
   * The browser can only read the public name — it is inlined at build time,
   * which means **setting it in Vercel without redeploying looks exactly like
   * setting it.** `NEXT_PUBLIC_ONESIGNAL_APP_ID` has cost this project a month
   * over the same trap; see B3 in `BACKLOG.md`.
   *
   * Read directly rather than through `SENTRY_DSN` in `sentry-scrub.ts`: that
   * constant falls back to the private variable, and a `process.env.SENTRY_DSN`
   * reference compiled into the client bundle would be replaced with
   * `undefined` here and read as a server secret by anyone skimming it.
   */
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  environment: SENTRY_ENVIRONMENT,

  /** See `sentry.server.config.ts`. */
  sendDefaultPii: false,

  tracesSampleRate: tracesSampleRate(),

  release:
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_APP_VERSION,

  beforeSend: scrubEvent,

  /**
   * **No `replayIntegration`, and this is the line to leave alone.**
   *
   * Session Replay is what the setup wizard adds by default and it would be the
   * worst feature in this codebase: it records the DOM, so on
   * `/dashboard/queue` it would record a coordinator reading a resident's
   * unedited account of their neighbours and send it to Frankfurt. Masking is
   * opt-out and one unmasked selector away from being wrong. The reasoning is
   * in `src/lib/sentry-scrub.ts` in full; turning it on is a decision with
   * `/privacy` §6 and both processing agreements attached to it.
   */
  integrations: [],

  debug: false,
});

/**
 * Required by Next for client-side navigation instrumentation. Without it the
 * SDK cannot tie an error to the route the browser was on when it happened.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
