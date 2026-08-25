import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  FileWarning,
  Scale,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { ComplianceForm } from "@/components/dashboard/compliance-form";
import { CommunityComplianceForm } from "@/components/dashboard/community-compliance-form";
import { VillageModeForm } from "@/components/dashboard/village-mode-form";
import { ControllerDuties } from "@/components/controller-duties";
import { MarkdownView } from "@/components/markdown-view";
import { NoVillage } from "@/components/no-village";
import { requireCoordinator } from "@/lib/auth";
import { getVillageCompliance } from "@/lib/compliance";
import { loadComplianceDocuments } from "@/lib/compliance-documents";
import { reportController } from "@/lib/community-report";
import { getVillageController } from "@/lib/villages";
import { formatDateTime } from "@/lib/format";
import { SUPPORT_EMAIL } from "@/lib/constants";

export const metadata: Metadata = { title: "Compliance" };

/**
 * The legal gate a village passes through before it can accept a single report.
 *
 * ## One screen, two models
 *
 * `Village.mode` decides what is on it. A **community** village — the default,
 * and most villages — sees one document, the Community Coordinator Agreement,
 * with the coordinator themselves as the data controller. A **council** village
 * sees the three a council is separately obliged to hold. Nothing else about
 * the screen changes: the documents are rendered in full, the acceptance is
 * one-way, and the gate blocks until the model's documents are accepted.
 *
 * The community screen carries one thing the council screen does not: what being
 * a data controller obliges somebody to do, in plain English
 * (`CONTROLLER_RESPONSIBILITIES`). A council has a clerk who knows; a volunteer
 * has nobody, and asking them to take on duties nobody has described is the same
 * failure as asking a council to accept a summary instead of a document.
 *
 * ## Why the whole document is on screen
 *
 * An acceptance recorded against a summary would be worth less than no
 * acceptance at all — it would look like a controlled process in the audit trail
 * while standing for a document nobody was shown. So the files are read from
 * `docs/` and rendered in full, in order, expanded. There is no accordion: a
 * collapsed legal document is a document that was not read, and the point of
 * this screen is that it was.
 *
 * The council order is deliberate and matches `COMPLIANCE_DOCUMENTS`: the
 * assessment first, because it explains what the processing is; then the policy
 * document that authorises the criminal offence data in it; then the contract,
 * which is the promise about how the processing is carried out.
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

  // The mode decides which documents to read, so this one cannot join the
  // parallel pair below it.
  const compliance = await getVillageCompliance(villageId);

  const [village, documents] = await Promise.all([
    // Falls back when `parish_council` is missing, so this page works on a
    // database where the village-activation migration has not run either.
    getVillageController(villageId),
    loadComplianceDocuments(compliance.mode),
  ]);

  const community = compliance.mode === "community";

  /*
    Who is accepting, and on whose behalf. In council mode that is the parish
    council, falling back to the deployment constant — which is still
    placeholders, and the paragraph at the foot of this page says so. In
    community mode it is the coordinator reading the screen: there is no body to
    name, and naming one would be the specific error this whole feature exists
    to stop — a volunteer accepting "on behalf of [Parish Council name]" has
    accepted on behalf of nobody.
  */
  const controller = community
    ? (session.profile?.fullName ?? "you")
    : reportController(village?.parishCouncil ?? null);

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
        Back to overview
      </Link>

      <header className="mt-4">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-slate-900">
          <ShieldCheck className="size-6 text-brand-600" aria-hidden />
          Compliance
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Reports filed through {village?.name ?? "your village"} describe
          suspected criminal activity, which is criminal offence data under UK
          GDPR Article 10. Processing it lawfully needs the paperwork in place
          before the first report — not after.{" "}
          {community ? (
            <>
              This village runs the <strong>community model</strong>: there is
              one agreement to read, and you are the data controller for it.
            </>
          ) : (
            <>
              This village runs the <strong>parish council model</strong>: read
              all three documents, then accept them on behalf of {controller}.
            </>
          )}
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
              Residents who open the report form are told to contact you.{" "}
              {community
                ? "The agreement below has to be accepted before that changes."
                : "All three documents below have to be accepted before that changes."}
            </p>
          </div>
        </div>
      )}

      {/*
        What being the controller actually means, before the document that makes
        somebody one. Community mode only: a parish council has a clerk who knows
        this, and a volunteer has nobody. Above the agreement rather than below
        it, because a duty explained after acceptance is a duty explained too
        late.
      */}
      {community && (
        <section className="mt-5 rounded-2xl border border-brand-200 bg-brand-50/60 p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Scale className="size-4 text-brand-600" aria-hidden />
            What you are taking on
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">
            In this model <strong>you are the data controller</strong> for your
            village&rsquo;s reports. That is a description of what you are
            already doing rather than a title you apply for — you decide who is
            invited in, what gets published and what happens to a report. Three
            duties come with it, and these are the ones with a deadline:
          </p>
          <ControllerDuties />
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            None of it is meant to be carried alone. Section 2 of the agreement
            below says what the software already does for each of these, and{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-brand-700 underline-offset-2 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>{" "}
            is where to go when one of them actually happens.
          </p>
        </section>
      )}

      {/*
        A jump list across the documents. They are long — the DPIA runs to ten
        steps — and a coordinator who has been asked to read something before
        signing it needs to be able to get back to §7 without scrolling for it.
      */}
      <nav
        aria-label="Documents"
        className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"
      >
        <h2 className="text-sm font-semibold text-slate-900">
          {community ? "The agreement" : "The documents"}
        </h2>
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
        {community ? (
          <CommunityComplianceForm
            coordinator={controller}
            village={village?.name ?? "your village"}
            accepted={accepted(compliance.communityDpa)}
            available={compliance.available}
          />
        ) : (
          <ComplianceForm
            parishCouncil={controller}
            dpiaAccepted={accepted(compliance.dpia)}
            apdAccepted={accepted(compliance.apd)}
            dpaAccepted={accepted(compliance.dpa)}
            available={compliance.available}
            /*
              A council village that upgraded from the community model and has
              not finished yet. Its reporting is open on the coordinator's
              agreement — see `isComplete` — and saying so is what stops a
              coordinator reading three unticked boxes as "my village is shut".
            */
            runningOnCommunityAgreement={
              compliance.communityDpa !== null && !compliance.dpa
                ? accepted(compliance.communityDpa)
                : null
            }
          />
        )}
      </div>

      {/*
        The upgrade, and only from community mode. It is at the foot of the page
        rather than beside the acceptance because it is the rarer decision by a
        long way: most villages have no council, and a control offering to hand
        one a village that does not have one is a control that invites the wrong
        answer.
      */}
      {community && compliance.available && (
        <div className="mt-5">
          <VillageModeForm village={village?.name ?? "your village"} />
        </div>
      )}

      {/*
        Only once the model's documents are accepted, and deliberately not
        before: the guide
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
              share with the police, and{" "}
              {community
                ? "what being the data controller obliges you to do"
                : "what you are responsible for on the council’s behalf"}
              . It takes about twenty minutes and it is worth reading once
              before the first report arrives.
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

      {community ? (
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          The agreement is a template prepared from the source code. It describes
          what the software does accurately, and it is not legal advice — you are
          the data controller, and the duties in it are yours. Take your own
          advice on the terms if you want to; nothing here is in a hurry, and a
          village that has not accepted it is refusing reports rather than
          processing them wrongly.
        </p>
      ) : (
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          All three documents are templates prepared from the source code. They
          describe what the software does accurately, and they are not a
          substitute for your council&rsquo;s own review — the council is the
          data controller, and the duty to carry out the assessment and maintain
          the policy document sits with the controller rather than with the
          service. The processing agreement is a contract between two parties:
          take your own advice on the terms before accepting it, and use the
          council&rsquo;s own standard agreement instead if it has one.
        </p>
      )}
    </div>
  );
}
