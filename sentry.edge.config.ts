import * as Sentry from "@sentry/nextjs";

import {
  SENTRY_DSN,
  SENTRY_ENVIRONMENT,
  scrubEvent,
  tracesSampleRate,
} from "@/lib/sentry-scrub";

/**
 * Sentry, edge runtime — which here means `src/proxy.ts` and nothing else.
 *
 * Next 16 calls the proxy on every request, including the two early returns and
 * both redirects, and it is where the session refresh and the Content-Security-
 * Policy nonce are minted. A failure in it is not a page that errors; it is
 * every page failing at once, which makes it the one file in the repository
 * where an unreported exception costs the most.
 *
 * The edge runtime has no Node APIs, so this config stays deliberately thin: no
 * integrations, no profiling, nothing that would reach for `node:` anything.
 * Loaded by `register()` in `src/instrumentation.ts` under
 * `NEXT_RUNTIME === "edge"`, the same way the server config is loaded.
 */
Sentry.init({
  dsn: SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,

  /** See the server config: cookies here are a live Supabase session. */
  sendDefaultPii: false,

  tracesSampleRate: tracesSampleRate(),

  release:
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_APP_VERSION,

  beforeSend: scrubEvent,

  debug: false,
});
