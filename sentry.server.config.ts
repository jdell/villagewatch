import * as Sentry from "@sentry/nextjs";

import {
  SENTRY_DSN,
  SENTRY_ENVIRONMENT,
  scrubEvent,
  tracesSampleRate,
} from "@/lib/sentry-scrub";

/**
 * Sentry, Node runtime.
 *
 * **Nothing auto-discovers this file.** Older versions of the SDK looked for
 * `sentry.server.config.ts` by name; v10 does not, and it is loaded because
 * `register()` in `src/instrumentation.ts` imports it. Move or rename it and
 * the only symptom is a server that silently reports nothing — so if you touch
 * the name, touch the import in the same commit.
 *
 * Every option that decides what leaves the building is in
 * `src/lib/sentry-scrub.ts`, which is where the argument for each one lives and
 * which the edge and browser configs share. This file is the wiring.
 */
Sentry.init({
  dsn: SENTRY_DSN,
  environment: SENTRY_ENVIRONMENT,

  /**
   * The one option with a wrong default for this codebase.
   *
   * `sendDefaultPii: true` attaches the client's IP address and the request's
   * cookies — which here is a live Supabase session token, in an issue tracker,
   * for anybody with access to the project. False is also the SDK's own
   * default; it is written out because a future upgrade changing it would be a
   * disclosure nobody reviewed, and because the wizard offers to turn it on.
   */
  sendDefaultPii: false,

  /** Off unless somebody sets the variable. See `tracesSampleRate`. */
  tracesSampleRate: tracesSampleRate(),

  /**
   * The release, so a stack trace resolves against the right source maps.
   * Vercel sets the commit SHA; the version is the fallback, which is what a
   * self-hosted deploy off a tag would have.
   */
  release:
    process.env.VERCEL_GIT_COMMIT_SHA || process.env.NEXT_PUBLIC_APP_VERSION,

  beforeSend: scrubEvent,

  /**
   * Quiet unless something is being debugged. The SDK is chatty on startup and
   * a cron log full of Sentry initialisation notices is a cron log nobody
   * reads — which is the failure the alerting in `slack.ts` exists to prevent.
   */
  debug: false,
});
