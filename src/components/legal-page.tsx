import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/logo";
import { SiteFooter } from "@/components/site-footer";
import { LEGAL_LAST_UPDATED } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";

/**
 * Shell for the privacy policy and terms of use.
 *
 * The two documents share a header, a contents list and a set of typographic
 * primitives, and nothing else — the prose lives in the pages themselves,
 * because legal text that has been squeezed into a data structure is legal text
 * nobody proofreads.
 *
 * The primitives exist because `@tailwindcss/typography` is not installed and
 * adding a plugin for two pages is not worth the dependency. They are exported
 * from here so both documents look identical without either one restating a
 * class list.
 */

export type LegalSectionRef = { id: string; title: string };

export function LegalPage({
  title,
  intro,
  sections,
  children,
}: {
  title: string;
  intro: string;
  /** Drives the contents list. Each id must match a `<LegalSection>` below. */
  sections: readonly LegalSectionRef[];
  children: React.ReactNode;
}) {
  // Rendered from a date-only constant, so there is no clock in it to disagree
  // with the server's — no hydration mismatch, unlike the relative times used
  // on incident cards.
  const updated = formatDateTime(`${LEGAL_LAST_UPDATED}T00:00:00Z`).replace(
    /,.*$/,
    "",
  );

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <nav
          aria-label="Main"
          className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-4 sm:px-6"
        >
          <Link href="/" className="text-slate-900">
            <Logo />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Back to home
          </Link>
        </nav>
      </header>

      <main className="flex-1 bg-slate-50">
        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            {title}
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Last updated {updated}
          </p>
          <p className="mt-6 text-lg leading-relaxed text-slate-700">{intro}</p>

          <nav
            aria-label="Contents"
            className="mt-8 rounded-2xl border border-slate-200 bg-white p-5"
          >
            <h2 className="text-sm font-semibold text-slate-900">Contents</h2>
            <ol className="mt-3 space-y-2 text-sm">
              {sections.map((section, index) => (
                <li key={section.id} className="flex gap-2.5">
                  <span className="tabular-nums text-slate-400">
                    {index + 1}.
                  </span>
                  <a
                    href={`#${section.id}`}
                    className="text-brand-700 underline-offset-2 transition hover:underline"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="mt-10 space-y-10">{children}</div>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}

export function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6">
      <h2 className="text-xl font-semibold tracking-tight text-slate-900">
        {title}
      </h2>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-base leading-relaxed text-slate-700">{children}</p>;
}

export function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="pt-2 text-base font-semibold text-slate-900">{children}</h3>
  );
}

export function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul className="space-y-2.5 pl-1">
      {children}
    </ul>
  );
}

export function LI({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-3 text-base leading-relaxed text-slate-700">
      <span
        className="mt-2.5 size-1.5 shrink-0 rounded-full bg-slate-400"
        aria-hidden
      />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

/** A definition row — used for the rights list and the retention schedule. */
export function DefinitionList({ children }: { children: React.ReactNode }) {
  return <dl className="space-y-4">{children}</dl>;
}

export function Definition({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <dt className="text-sm font-semibold text-slate-900">{term}</dt>
      <dd className="mt-1.5 text-base leading-relaxed text-slate-700">
        {children}
      </dd>
    </div>
  );
}

/** Pulled out of the flow — used for the things a resident must not miss. */
export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "warning";
  title?: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-brand-200 bg-brand-50 text-brand-900";

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      {title && <p className="text-sm font-semibold">{title}</p>}
      <div className={`text-base leading-relaxed ${title ? "mt-1.5" : ""}`}>
        {children}
      </div>
    </div>
  );
}
