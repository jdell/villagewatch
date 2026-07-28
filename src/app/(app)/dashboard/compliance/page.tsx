import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileWarning,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { ComplianceForm } from "@/components/dashboard/compliance-form";
import { MarkdownView } from "@/components/markdown-view";
import { NoVillage } from "@/components/no-village";
import { requireCoordinator } from "@/lib/auth";
import { getVillageCompliance } from "@/lib/compliance";
import { loadComplianceDocuments } from "@/lib/compliance-documents";
import { reportController } from "@/lib/community-report";
import { getVillageController } from "@/lib/village";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Compliance" };

/**
 * The legal gate a village passes through before it can accept a single report.
 *
 * ## Why the whole document is on screen
 *
 * A coordinator is accepting the DPIA, the Appropriate Policy Document and the
 * data processing agreement **on their parish council's behalf**, and the
 * council is the data controller. An acceptance recorded against a summary would
 * be worth less than no acceptance at all — it would look like a controlled
 * process in the audit trail while standing for a document nobody was shown. So
 * all three files are read from `docs/` and rendered in full, in order,
 * expanded. There is no accordion: a collapsed legal document is a document that
 * was not read, and the point of this screen is that it was.
 *
 * The order is deliberate and matches `COMPLIANCE_DOCUMENTS`: the assessment
 * first, because it explains what the processing is; then the policy document
 * that authorises the criminal offence data in it; then the contract, which is
 * the promise about how the processing is carried out.
 *
 * ## Why it is not `force-dynamic`
 *
 * It does not need to be. Everything behind `(app)` is already dynamic — the
 * group's layout calls `requireSession()`, which reads cookies — and this page
 * reads the database on top of that.
 */
export default async function CompliancePage() {
  const session = await requireCoordinator("/dashboard/compliance");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  const [village, compliance, documents] = await Promise.all([
    // Falls back when `parish_council` is missing, so this page works on a
    // database where the village-activation migration has not run either.
    getVillageController(villageId),
    getVillageCompliance(villageId),
    loadComplianceDocuments(),
  ]);

  const controller = reportController(village?.parishCouncil ?? null);

  const accepted = (
    entry: { acceptedAt: Date; acceptedBy: { fullName: string } | null } | null,
  ) =>
    entry
      ? {
          acceptedAt: formatDateTime(entry.acceptedAt),
          // Null when the accepting coordinator has since closed their account.
          // The audit trail still names them by email; this screen does not
          // invent a name to fill the gap.
          acceptedBy: entry.acceptedBy?.fullName ?? null,
        }
      : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to dashboard
      </Link>

      <header className="mt-4">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-slate-900">
          <ShieldCheck className="size-6 text-brand-600" aria-hidden />
          Compliance
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Reports filed through {village?.name ?? "your village"} describe
          suspected criminal activity, which is criminal offence data under UK
          GDPR Article 10. Processing it lawfully needs three documents in place
          before the first report — not after. Read all three, then accept them
          on behalf of {controller}.
        </p>
      </header>

      {!compliance.complete && compliance.available && (
        <div
          role="status"
          className="mt-5 flex gap-3 rounded-2xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-600/20"
        >
          <FileWarning className="size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm leading-relaxed text-amber-900">
            <p className="font-medium">
              This village cannot accept incident reports yet.
            </p>
            <p className="mt-1">
              Residents who open the report form are told to contact you. All
              three documents below have to be accepted before that changes.
            </p>
          </div>
        </div>
      )}

      {/*
        A jump list across all three documents. They are long — the DPIA runs to
        ten steps — and a coordinator who has been asked to read something before
        signing it needs to be able to get back to §7 without scrolling for it.
      */}
      <nav
        aria-label="Documents"
        className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
      >
        <h2 className="text-sm font-semibold text-slate-900">The documents</h2>
        <ul className="mt-3 space-y-3">
          {documents.map((document) => (
            <li key={document.id}>
              <a
                href={`#document-${document.id}`}
                className="text-sm font-medium text-brand-700 underline-offset-2 hover:underline"
              >
                {document.label}
              </a>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                {document.basis} · {document.summary}
              </p>
            </li>
          ))}
        </ul>
      </nav>

      {documents.map((document) => (
        <section
          key={document.id}
          id={`document-${document.id}`}
          className="mt-5 scroll-mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"
        >
          <div className="flex items-start gap-2.5 border-b border-slate-200 pb-4">
            <ScrollText
              className="mt-0.5 size-5 shrink-0 text-slate-400"
              aria-hidden
            />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight text-slate-900">
                {document.label}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {document.basis} · <code>{document.path}</code>
              </p>
            </div>
          </div>

          {document.ok ? (
            <>
              {document.contents.length > 0 && (
                <nav
                  aria-label={`${document.shortLabel} contents`}
                  className="mt-4 rounded-xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200"
                >
                  <ul className="space-y-1.5">
                    {document.contents.map((entry) => (
                      <li
                        key={entry.id}
                        className={entry.level === 3 ? "pl-4" : ""}
                      >
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

              <div className="mt-5">
                <MarkdownView blocks={document.blocks} />
              </div>
            </>
          ) : (
            /*
              The form still renders below, and that is deliberate: a document
              that failed to load is a deployment fault, and a coordinator who
              has already read the file elsewhere should not be locked out of
              recording an acceptance by a tracing bug. What must not happen is
              this failing silently — so it says exactly what is wrong.
            */
            <div className="mt-4 rounded-xl bg-red-50 p-3.5 text-sm leading-relaxed text-red-900 ring-1 ring-inset ring-red-600/20">
              <p className="font-medium">This document could not be loaded.</p>
              <p className="mt-1">{document.error}</p>
            </div>
          )}
        </section>
      ))}

      <div className="mt-5">
        <ComplianceForm
          parishCouncil={controller}
          dpiaAccepted={accepted(compliance.dpia)}
          apdAccepted={accepted(compliance.apd)}
          dpaAccepted={accepted(compliance.dpa)}
          available={compliance.available}
        />
      </div>

      {/*
        Only once all three are accepted, and deliberately not before: the guide
        is about running a village, and a coordinator who has not finished this
        screen has no village to run yet. Putting it here rather than only in the
        sidebar catches somebody at the one moment they are certain to be looking
        — they have just read three legal documents and are wondering what
        happens next.

        Informational, never a blocker. Nothing is recorded by following it and
        nothing waits on it having been read.
      */}
      {compliance.complete && (
        <div className="mt-5 flex gap-3 rounded-2xl border border-brand-200 bg-brand-50/60 p-4 sm:p-5">
          <BookOpen className="size-5 shrink-0 text-brand-600" aria-hidden />
          <div className="min-w-0 text-sm leading-relaxed text-slate-700">
            <p className="font-medium text-slate-900">
              Your village is open. Here is what to do next.
            </p>
            <p className="mt-1">
              The Coordinator Guide covers the settings to choose before you
              invite residents, how to work the moderation queue, what you can
              share with the police, and what you are responsible for on the
              council&rsquo;s behalf. It takes about twenty minutes and it is
              worth reading once before the first report arrives.
            </p>
            <Link
              href="/dashboard/guide"
              className="mt-2.5 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 underline-offset-2 hover:underline"
            >
              Read the Coordinator Guide
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </div>
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        All three documents are templates prepared from the source code. They
        describe what the software does accurately, and they are not a substitute
        for your council&rsquo;s own review — the council is the data controller,
        and the duty to carry out the assessment and maintain the policy document
        sits with the controller rather than with the service. The processing
        agreement is a contract between two parties: take your own advice on the
        terms before accepting it, and use the council&rsquo;s own standard
        agreement instead if it has one.
      </p>
    </div>
  );
}
