import Link from "next/link";
import { Logo } from "@/components/logo";

/**
 * The shell behind `not-found.tsx` and `error.tsx`.
 *
 * No `"use client"` and no hooks, so it renders from the Server Component
 * 404 page and from the Client Component error boundary without a second copy
 * existing for each.
 *
 * Both of those files sit at the root, above `(app)/layout.tsx`, so neither
 * gets the sidebar — the shell needs a session and a lost or broken page is
 * exactly where that might be the thing that failed. Hence the logo and the
 * links: whoever lands here needs a way out that does not depend on anything
 * having loaded.
 */
export function StatusScreen({
  icon,
  code,
  title,
  children,
  actions,
}: {
  icon: React.ReactNode;
  /** Short marker above the heading — "404", "Error". */
  code: string;
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col bg-slate-50">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <Link href="/" className="inline-block text-slate-900">
            <Logo />
          </Link>

          <span className="mx-auto mt-8 grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            {icon}
          </span>

          <p className="mt-5 font-mono text-xs font-semibold uppercase tracking-wider text-slate-400">
            {code}
          </p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-slate-900">
            {title}
          </h1>

          <div className="mt-3 text-sm leading-relaxed text-slate-600">
            {children}
          </div>

          {actions && (
            <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              {actions}
            </div>
          )}
        </div>

        <p className="mt-6 text-center text-sm text-slate-500">
          In an emergency, always call 999 first.
        </p>
      </div>
    </div>
  );
}

/** Shared button classes, so the two screens cannot drift apart visually. */
export const primaryActionClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700";

export const secondaryActionClass =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50";
