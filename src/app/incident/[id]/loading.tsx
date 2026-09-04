import { Logo } from "@/components/logo";

/**
 * The skeleton shown while `page.tsx` waits on its two queries.
 *
 * `page.tsx` is `force-dynamic` and makes two database round trips before it
 * can render anything, so there is a real gap here — and this page is reached
 * by tapping a link in a WhatsApp thread, which is the context least tolerant
 * of a blank screen. Next renders this instantly from the server while the
 * segment resolves.
 *
 * ## It mirrors the page's layout on purpose
 *
 * Same `max-w-3xl` column, same header, same three stacked cards at the same
 * rough heights. A skeleton whose shape does not match what replaces it reads
 * as the page having changed its mind, which is worse than a spinner; matching
 * it means the only thing that happens on load is the grey turning into words.
 *
 * ## Nothing here is real
 *
 * Every bar is a decorative div. There is no incident in scope at this point —
 * `loading.tsx` receives no params and does no fetching — so there is nothing
 * to withhold, and this file cannot leak by construction. That is worth stating
 * because the panel it stands in for on the finished page uses the *same*
 * placeholder-bar technique for a security reason rather than a cosmetic one:
 * see the note on the wall in `page.tsx`.
 *
 * `aria-hidden` with a polite live-region label above it, so a screen reader
 * announces "Loading" once instead of reading out a dozen empty boxes.
 */
export default function IncidentPreviewLoading() {
  return (
    <div className="flex min-h-dvh flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="text-slate-900">
            <Logo />
          </span>
          <div className="h-4 w-14 rounded bg-slate-200" aria-hidden />
        </div>
      </header>

      <main className="flex-1">
        <p role="status" aria-live="polite" className="sr-only">
          Loading this report
        </p>

        <div
          aria-hidden
          className="mx-auto w-full max-w-3xl animate-pulse px-4 py-10 sm:px-6 sm:py-14"
        >
          {/* The teaser card. */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="flex flex-wrap items-center gap-2">
              <div className="h-6 w-44 rounded-full bg-slate-200" />
              <div className="h-6 w-20 rounded-full bg-slate-200" />
            </div>

            <div className="mt-4 space-y-2.5">
              <div className="h-7 w-full rounded bg-slate-300" />
              <div className="h-7 w-2/3 rounded bg-slate-300" />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <div className="h-7 w-32 rounded-full bg-slate-200" />
              <div className="h-4 w-40 rounded bg-slate-200" />
            </div>

            <div className="mt-6 space-y-2.5">
              <div className="h-4 w-full rounded bg-slate-200" />
              <div className="h-4 w-4/5 rounded bg-slate-200" />
            </div>
          </div>

          {/* The locked panel. */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="mx-auto size-11 rounded-xl bg-slate-200" />
            <div className="mx-auto mt-4 h-5 w-56 rounded bg-slate-200" />
            <div className="mx-auto mt-3 h-4 w-72 max-w-full rounded bg-slate-200" />
            <div className="mx-auto mt-6 h-11 w-60 max-w-full rounded-lg bg-slate-200" />
          </div>

          {/* What an account is for. */}
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
            <div className="h-6 w-64 max-w-full rounded bg-slate-200" />
            <div className="mt-5 space-y-4">
              {[0, 1, 2, 3, 4].map((row) => (
                <div key={row} className="flex gap-3.5">
                  <div className="size-8 shrink-0 rounded-lg bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-40 rounded bg-slate-200" />
                    <div className="h-3.5 w-full rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* The call to action. */}
          <div className="mt-6 rounded-2xl bg-brand-950 p-6 sm:p-10">
            <div className="mx-auto h-6 w-72 max-w-full rounded-full bg-white/10" />
            <div className="mx-auto mt-5 h-8 w-80 max-w-full rounded bg-white/15" />
            <div className="mx-auto mt-4 h-4 w-full max-w-md rounded bg-white/10" />
            <div className="mx-auto mt-7 h-12 w-56 max-w-full rounded-lg bg-white/20" />
          </div>
        </div>
      </main>
    </div>
  );
}
