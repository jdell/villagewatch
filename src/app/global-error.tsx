"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * The boundary of last resort: an error thrown by the **root layout itself**.
 *
 * `error.tsx` beside this file catches everything below the root layout and is
 * where nearly every failure lands. What it cannot catch is the layout above
 * it — Next's own words: `error.js` "does not wrap the `layout.js` or
 * `template.js` above it in the same segment". So a failure in
 * `src/app/layout.tsx` — the fonts, the metadata, the `Toaster` — has no
 * boundary at all without this file, and produces the browser's own blank
 * error page with a stack trace on it.
 *
 * ## It replaces the root layout, which is why it looks like this
 *
 * When this renders, the layout that would have provided `<html>`, `<body>`,
 * the fonts and the stylesheet is the thing that failed. Next's docs are
 * explicit that global error UI "must define its own `<html>` and `<body>`
 * tags, global styles, fonts, or other dependencies".
 *
 * So **every style here is inline and nothing is imported**. Not for
 * consistency with the rest of the app — against it. `globals.css` is pulled in
 * by the root layout, so a Tailwind class on this page is a class whose
 * stylesheet may never have been linked, and a "friendly fallback" rendered as
 * unstyled black-on-white text at browser defaults is the one place that
 * matters most. There is no `next/link`, no `Logo`, no icon component and no
 * `StatusScreen` here for the same reason: the less this depends on, the more
 * likely it is to be what somebody actually sees.
 *
 * `metadata` cannot be exported from a Client Component, so the tab's title is
 * React's own `<title>` element — which is what Next's documentation points at.
 *
 * ## It is deliberately plainer than `error.tsx`
 *
 * That one offers a way back to the map, because the app was working a moment
 * ago. This one cannot promise that any route works, so it offers the two
 * things that do not depend on the application rendering at all: try again,
 * and start from the top.
 */
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    /*
      **The one import in this file, and it is a deliberate exception to the
      rule at the top of it.**

      Everything else here is inline and imports nothing, because `globals.css`
      is pulled in by the layout that has just failed and the less this depends
      on, the more likely it is to be what somebody actually sees. A static
      `import * as Sentry` is a dependency in exactly the file whose design says
      it should have none.

      It is taken on for two reasons. A root-layout failure is the **most**
      important error in the application to capture — it is the one that takes
      every screen down at once, and it is the one nobody will report, because
      what a resident sees is a page that says something went wrong. And the SDK
      is already in the client bundle and already initialised by
      `src/instrumentation-client.ts`, so what this adds is a reference to a
      module that is loaded either way rather than a new thing to fetch.

      What it does not do is introduce a *render* dependency: the markup below
      is untouched by it, so a Sentry failure cannot take the fallback down with
      it. If that ever stops being true, this import is the first thing to
      reconsider. See "The error boundaries" in CLAUDE.md, which records the
      exception alongside the rule.
    */
    Sentry.captureException(error);
    console.error("VillageWatch root layout error", error);
  }, [error]);

  return (
    <html lang="en-GB">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f8fafc",
          color: "#0f172a",
          fontFamily:
            'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          padding: "1.5rem",
        }}
      >
        <title>Something went wrong · VillageWatch</title>

        <main
          style={{
            maxWidth: "30rem",
            width: "100%",
            backgroundColor: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: "1rem",
            padding: "1.75rem",
            textAlign: "center",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#94a3b8",
            }}
          >
            VillageWatch
          </p>

          <h1
            style={{
              margin: "0.75rem 0 0",
              fontSize: "1.25rem",
              lineHeight: 1.3,
              color: "#0f172a",
            }}
          >
            Something went wrong
          </h1>

          <p
            style={{
              margin: "0.75rem 0 0",
              fontSize: "0.9375rem",
              lineHeight: 1.6,
              color: "#475569",
            }}
          >
            This is a fault on our side rather than anything you did. Nothing you
            had already filed has been lost — a report is saved the moment it is
            submitted.
          </p>

          {/*
            In an emergency the answer is never this page, and somebody who has
            arrived here may have been part way through reporting something.
            `error.tsx` can afford to leave this out because it still offers a
            working route into the app; this one cannot promise any route works.
          */}
          <p
            style={{
              margin: "0.75rem 0 0",
              fontSize: "0.9375rem",
              lineHeight: 1.6,
              color: "#475569",
            }}
          >
            If you need the police now, call 999 — or 101 if it is not an
            emergency.
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.75rem",
              justifyContent: "center",
              marginTop: "1.5rem",
            }}
          >
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{
                appearance: "none",
                border: "none",
                cursor: "pointer",
                height: "2.75rem",
                padding: "0 1.25rem",
                borderRadius: "0.5rem",
                backgroundColor: "#2563eb",
                color: "#ffffff",
                fontSize: "0.875rem",
                fontWeight: 600,
              }}
            >
              Try again
            </button>

            {/*
              A plain anchor rather than `next/link`, and the lint rule that
              asks for one is switched off here rather than obeyed.

              Its premise is that a client-side navigation is faster and keeps
              the application's state. Both are true and both are the problem:
              the root layout is what failed, so the React tree already running
              is the broken thing, and a soft navigation would carry it to the
              next screen. A full document load is the only way back from here,
              and it is also the only kind of navigation that still works if the
              client bundle never finished loading at all.
            */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: "2.75rem",
                padding: "0 1.25rem",
                borderRadius: "0.5rem",
                border: "1px solid #cbd5e1",
                backgroundColor: "#ffffff",
                color: "#334155",
                fontSize: "0.875rem",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Start again
            </a>
          </div>

          {/*
            The digest and never `error.message`. In production Next replaces
            the message with a generic string anyway; on a preview it would be
            the raw Postgres or Supabase error, and a connection string on a
            resident's screen is worse than an unhelpful sentence. The digest is
            what a coordinator can quote.
          */}
          {error.digest && (
            <p
              style={{
                margin: "1.25rem 0 0",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.75rem",
                color: "#94a3b8",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
