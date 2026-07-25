"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Home, RefreshCw, TriangleAlert } from "lucide-react";
import {
  StatusScreen,
  primaryActionClass,
  secondaryActionClass,
} from "@/components/status-screen";

/**
 * The error boundary for everything below the root layout.
 *
 * Error boundaries have to be Client Components — React needs a component that
 * can hold the error in state and re-render around it.
 *
 * Next 16.2 passes `unstable_retry`, which re-fetches and re-renders the
 * segment that failed rather than only clearing the error state the way
 * `reset` did. Most failures here will be a database or Supabase call that
 * timed out, and re-fetching is the thing that fixes those.
 *
 * What is *not* shown is `error.message`. In production Next replaces it with
 * a generic string and a digest anyway, but on a preview deployment it would
 * be a raw Postgres or Supabase error, and a connection string in a stack
 * trace on a resident's screen is a worse outcome than an unhelpful sentence.
 * The digest is shown because it is the thing a coordinator can quote when
 * reporting the problem.
 */
export default function GlobalErrorBoundary({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    // Server-side failures are already in the platform logs; this catches the
    // client-side ones, which otherwise leave no trace at all.
    console.error("VillageWatch render error", error);
  }, [error]);

  return (
    <StatusScreen
      icon={<TriangleAlert className="size-7" aria-hidden />}
      code="Something went wrong"
      title="That did not load"
      actions={
        <>
          <button
            type="button"
            onClick={() => unstable_retry()}
            className={primaryActionClass}
          >
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </button>
          <Link href="/map" className={secondaryActionClass}>
            <Home className="size-4" aria-hidden />
            Go to the map
          </Link>
        </>
      }
    >
      <p>
        Something broke on our side, not yours. Nothing you had already filed
        has been lost — reports are saved the moment you submit them.
      </p>
      <p className="mt-3">
        Trying again usually works. If it keeps happening, tell your village
        coordinator.
      </p>

      {error.digest && (
        <p className="mt-4 font-mono text-xs text-slate-400">
          Reference: {error.digest}
        </p>
      )}
    </StatusScreen>
  );
}
