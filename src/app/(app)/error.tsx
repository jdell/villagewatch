"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Home, RefreshCw, TriangleAlert } from "lucide-react";

/**
 * The boundary for the authenticated screens.
 *
 * ## What it buys over the root one
 *
 * Next renders the *nearest* boundary, so without this file an error on
 * `/dashboard` bubbles to `src/app/error.tsx` — which is a full-page shell with
 * its own logo, built for the routes **above** `(app)/layout.tsx` where there
 * is no sidebar and possibly no session. Landing there from inside the app
 * throws away the navigation a signed-in resident was using and replaces the
 * whole window over one panel failing.
 *
 * This one renders *inside* the shell. The sidebar, the village banner and the
 * queue badge all survive, so what a coordinator sees is one screen that did
 * not load rather than an application that fell over, and every other tab is
 * one click away. That is also why it does not use `StatusScreen`: the shell
 * already has a logo, and a second one inside it reads as a page within a page.
 *
 * ## What it cannot catch
 *
 * `(app)/layout.tsx` itself — Next's `error.js` "does not wrap the `layout.js`
 * above it in the same segment". That layout is `requireSession()` and the
 * queue-badge read, so a failure there still goes to the root boundary, which
 * is the right place for it: a session that cannot be established is not a
 * screen that failed to load.
 *
 * `redirect()` is not an error and does not land here. `requireSession()` and
 * `requireCoordinator()` throw a redirect that Next handles itself, so the
 * gates keep working with a boundary in front of them.
 */
export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    /*
      The resident's own browser console, and nowhere else — see the longer
      note in `src/app/error.tsx`. The server half of this is reported by
      `src/instrumentation.ts`; a failure that happened in the browser is not,
      and the digest below is absent in exactly that case.
    */
    console.error("VillageWatch screen error", error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-amber-50 text-amber-600">
          <TriangleAlert className="size-6" aria-hidden />
        </span>

        <h1 className="mt-4 text-lg font-semibold text-slate-900">
          This screen did not load
        </h1>

        <div className="mt-2 text-sm leading-relaxed text-slate-600">
          <p>
            Something broke on our side, not yours. Nothing you had already
            filed has been lost — a report is saved the moment it is submitted.
          </p>
          <p className="mt-3">
            Trying again usually works, and the rest of your village&rsquo;s
            pages are still there in the menu. If it keeps happening, tell your
            village coordinator.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {/*
            `unstable_retry` rather than `reset`: it re-fetches and re-renders
            the segment instead of only clearing the error state, and almost
            everything that fails on these screens is a database or Supabase
            call that timed out — re-fetching is the thing that fixes those.
          */}
          <button
            type="button"
            onClick={() => unstable_retry()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </button>

          <Link
            href="/map"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
          >
            <Home className="size-4" aria-hidden />
            Go to the map
          </Link>
        </div>

        {/*
          Never `error.message` — in production Next replaces it with a generic
          string, and on a preview it would be the raw Postgres or Supabase
          error. The digest is the part a coordinator can quote.
        */}
        {error.digest && (
          <p className="mt-5 font-mono text-xs text-slate-400">
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
