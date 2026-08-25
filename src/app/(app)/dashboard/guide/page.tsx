import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, BookOpen, LifeBuoy } from "lucide-react";
import { MarkdownView } from "@/components/markdown-view";
import { requireCoordinator } from "@/lib/auth";
import { getVillageMode } from "@/lib/villages";
import { COORDINATOR_GUIDE_FILE, loadDocument } from "@/lib/docs";
import { DEFAULT_VILLAGE_MODE, SUPPORT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = { title: "Coordinator Guide" };

/**
 * How to run a village, for the person running one.
 *
 * The same shape as `/dashboard/compliance` and deliberately so: the document
 * lives in `docs/` and is rendered from disk, rather than being restated as JSX
 * that would drift from it. What it is *not* is part of the compliance gate —
 * nothing here blocks anything, nothing is accepted, and no row is written. A
 * coordinator can read it, ignore it, or come back to it in six months.
 *
 * Coordinator-only, for the same reason the dashboard is: it describes the
 * moderation queue, the audit trail and the village settings, and a resident has
 * none of those. It is not a secret — every claim in it is also in the privacy
 * notice or the terms — so the gate is `requireCoordinator()` rather than
 * anything stronger, and there is no village scoping to do because the document
 * is the same for every village.
 *
 * `docs/COORDINATOR_GUIDE.md` needs a line in `outputFileTracingIncludes` in
 * `next.config.ts` against this route, or it renders as the failure panel below
 * in production while working perfectly in `npm run dev`. See `src/lib/docs.ts`.
 */
export default async function CoordinatorGuidePage() {
  const session = await requireCoordinator("/dashboard/guide");
  const villageId = session.profile?.villageId;

  /*
    One sentence of the header reads `Village.mode` and nothing else does — the
    document itself is the same for every village, which is why there is no
    village scoping to do below it. `getVillageMode` is the cheap read and it
    falls back to `community` rather than throwing, so a coordinator with no
    village attached still gets the guide rather than an error page.
  */
  const [guide, mode] = await Promise.all([
    loadDocument(COORDINATOR_GUIDE_FILE),
    villageId && process.env.DATABASE_URL
      ? getVillageMode(villageId)
      : Promise.resolve(DEFAULT_VILLAGE_MODE),
  ]);

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to overview
      </Link>

      <header className="mt-4">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-slate-900">
          <BookOpen className="size-6 text-brand-600" aria-hidden />
          Coordinator Guide
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Everything you need to run VillageWatch for your village — the settings
          to choose before you open it to residents, how to handle the moderation
          queue, what you can share with the police, and{" "}
          {mode === "community"
            ? "what being your village’s data controller obliges you to do"
            : "what you are responsible for on your council’s behalf"}
          .
        </p>
      </header>

      {guide.ok ? (
        <>
          {guide.contents.length > 0 && (
            <nav
              aria-label="Contents"
              className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
            >
              <h2 className="text-sm font-semibold text-slate-900">Contents</h2>
              <ul className="mt-3 space-y-1.5">
                {guide.contents.map((entry) => (
                  <li key={entry.id} className={entry.level === 3 ? "pl-4" : ""}>
                    <a
                      href={`#${entry.id}`}
                      className="text-sm text-brand-700 underline-offset-2 hover:underline"
                    >
                      {entry.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          )}

          <article className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
            <MarkdownView blocks={guide.blocks} />
          </article>
        </>
      ) : (
        /*
          Same treatment the compliance page gives a document that would not
          load, and for the same reason: this failing silently would leave a
          coordinator looking at an empty page with nothing to tell them why.
        */
        <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm leading-relaxed text-red-900 ring-1 ring-inset ring-red-600/20">
          <p className="font-medium">The guide could not be loaded.</p>
          <p className="mt-1">{guide.error}</p>
          <p className="mt-2">
            Nothing is broken for your residents — this page is the only thing
            affected. Let us know at {SUPPORT_EMAIL}.
          </p>
        </div>
      )}

      <div className="mt-5 flex gap-3 rounded-2xl bg-slate-100 p-4 sm:p-5">
        <LifeBuoy className="size-5 shrink-0 text-slate-500" aria-hidden />
        <p className="text-sm leading-relaxed text-slate-600">
          Something not covered here, or something that does not match what you
          see on screen? Email{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="font-medium text-brand-700 underline-offset-2 hover:underline"
          >
            {SUPPORT_EMAIL}
          </a>
          . In an emergency, call 999 — VillageWatch is not monitored and is not
          a route to the police.
        </p>
      </div>
    </div>
  );
}
