"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Check, ClipboardCopy, Loader2, Share2, Sparkles } from "lucide-react";
import {
  generateNarrativeAction,
  type NarrativeState,
} from "@/app/(app)/reports/actions";
import { DownloadPdfButton } from "@/components/reports/download-pdf-button";
import type { CommunityReportData } from "@/lib/community-report";
import {
  AI_ANALYSIS_NOTE,
  formatCommunityReport,
  GENERATED_BY,
  rangeDays,
} from "@/lib/community-report";
import { copyText, shareText } from "@/lib/clipboard";
import {
  APP_NAME,
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
} from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";

/**
 * The community safety report: what is on screen, what goes on the clipboard,
 * and what goes into the PDF.
 *
 * All three are the same document. The plain-text version is built here by
 * `formatCommunityReport` — the same function, in the browser — from the data
 * the page collected plus whatever narrative has come back from the action, so
 * a coordinator cannot copy one thing and send another.
 *
 * ## Why this is a Client Component at all
 *
 * Two of the things it does are browser APIs with no server half:
 * `navigator.share` and the clipboard. The third is the narrative, which
 * arrives from a server action and has to land somewhere the other two can see
 * it. Everything privileged — the village scoping, the status filter, the audit
 * row — happened before this rendered.
 *
 * ## The way out is the PDF
 *
 * `GET /api/reports/[villageId]/pdf` renders the document server-side, so the
 * file is identical whoever presses the button. There used to be a "Print or
 * save as PDF" button beside it, on the reasoning that a browser's own print
 * dialogue offers "Save as PDF" everywhere and prints exactly what is on the
 * screen. What it cannot do is produce the same file twice — the page size, the
 * margins, the browser's own headers and footers and whether backgrounds
 * survive are all the recipient's settings, so the monthly report to the same
 * PCSO came out different every month and on a phone usually arrived with the
 * app's chrome in it. Two buttons producing two different PDFs is worse than
 * one producing a predictable file, so the server route is now the only one.
 *
 * The `@media print` rules stay, and `[data-print-region]` /
 * `[data-print-hide]` still mark what survives them. They are page-global (the
 * invite sheet uses them too), and with them Ctrl+P on this screen still
 * produces the report rather than the whole app shell — nothing advertises it,
 * and nothing needs to.
 *
 * ## The pattern analysis, and whose wording it is
 *
 * The PDF cannot carry *this* analysis. A GET route cannot see a component's
 * state and must not be handed prose by the browser, so it writes its own —
 * counted by default, and from the model when `withAnalysis` sends
 * `analysis=ai`, which this component does once the coordinator has generated
 * one here. Same reports, same prompt, possibly different sentences. The line
 * under the buttons says so, and "Copy report" is the answer for anyone who
 * wants the exact wording they are looking at: it is built from this
 * component's own state.
 */

const IDLE: NarrativeState = { narrative: null, message: "", ok: true };

/** How long a button stays saying "Copied!" before going back. */
const COPIED_MS = 2_000;

function GenerateButton({ hasNarrative }: { hasNarrative: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Sparkles className="size-4" aria-hidden />
      )}
      {pending
        ? "Reading the reports…"
        : hasNarrative
          ? "Write it again"
          : "Write the analysis"}
    </button>
  );
}

export function ReportView({
  report,
  villageId,
  rangeFields,
}: {
  /** Everything but the narrative. Collected on the server. */
  report: Omit<CommunityReportData, "narrative">;
  /**
   * The coordinator's own village, for the PDF route's path.
   *
   * It decides nothing — the route takes the village from the session and
   * refuses an id that does not match it (domain rule 4). It is here so the
   * link names the village it is for.
   */
  villageId: string;
  /** The resolved range, posted back so the action re-derives the same period. */
  rangeFields: { range: string; from: string; to: string };
}) {
  const [state, generate] = useActionState(generateNarrativeAction, IDLE);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (state.message) toast[state.ok ? "info" : "error"](state.message);
  }, [state]);

  const full: CommunityReportData = useMemo(
    () => ({ ...report, narrative: state.narrative }),
    [report, state.narrative],
  );

  const text = useMemo(() => formatCommunityReport(full), [full]);

  const documentTitle = `Community Safety Report — ${report.villageName}`;
  const days = rangeDays(report.from, report.to);

  function markCopied() {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  async function handleCopy() {
    if (await copyText(text)) {
      markCopied();
      toast.success("Report copied.");
      return;
    }

    toast.error("Could not reach the clipboard — select the report and copy it.");
  }

  async function handleShare() {
    const outcome = await shareText({ title: documentTitle, text });

    if (outcome === "copied") {
      markCopied();
      toast.success("No share sheet here — the report is on your clipboard.");
    } else if (outcome === "failed") {
      toast.error("Could not share — copy the report instead.");
    }
  }

  return (
    <>
      <form action={generate} className="mt-6" data-print-hide>
        <input type="hidden" name="range" value={rangeFields.range} />
        <input type="hidden" name="from" value={rangeFields.from} />
        <input type="hidden" name="to" value={rangeFields.to} />

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Sparkles className="size-4 text-slate-400" aria-hidden />
            Pattern analysis
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {state.narrative
              ? state.narrative.source === "ai"
                ? `Written by ${state.narrative.model ?? "the AI"} from the reports below. Read it before you send it — it describes what residents reported, not what the police have found.`
                : "Assembled from the counts below. No AI summary was available."
              : "Everything else in this report is counted from your village's reports and is ready now. This section reads them for what connects — a repeated place, a time of day, an escalation — and costs one AI call."}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <GenerateButton hasNarrative={Boolean(state.narrative)} />
            {!state.narrative && (
              <span className="text-xs text-slate-400">
                Optional. The report is complete without it.
              </span>
            )}
          </div>
        </div>
      </form>

      {/*
        Download first and in brand blue, the other two behind it in one weight.
        The PDF is the document that leaves the village; copying and sharing are
        a coordinator moving the same text around by hand.
      */}
      <div className="mt-4 flex flex-wrap gap-2" data-print-hide>
        <DownloadPdfButton
          villageId={villageId}
          report={report}
          rangeFields={rangeFields}
          withAnalysis={state.narrative?.source === "ai"}
        />

        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <ClipboardCopy className="size-4" aria-hidden />
          )}
          {copied ? "Copied!" : "Copy report"}
        </button>

        <button
          type="button"
          onClick={handleShare}
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <Share2 className="size-4" aria-hidden />
          Share
        </button>
      </div>

      {/*
        Only once there is something to differ. The PDF's analysis is written by
        the route when it builds the file — a GET cannot see this component's
        state — so a coordinator who has read the paragraph above is entitled to
        know that the one in the file is a second pass over the same reports and
        may be worded differently. Saying it to somebody who never generated an
        analysis would be noise about a difference they cannot observe.
      */}
      {state.narrative?.source === "ai" && (
        <p className="mt-2 text-xs text-slate-500" data-print-hide>
          The PDF is written fresh when you download it, so its pattern analysis
          may be worded differently from the one above.{" "}
          <strong className="font-semibold text-slate-600">Copy report</strong>{" "}
          keeps this exact wording.
        </p>
      )}

      {/*
        The document. `data-print-region` is what the print rules keep; see
        globals.css. Rendered as HTML rather than the plain text above so the
        printed copy is readable — the clipboard version is the same content in
        the format an email body wants.
      */}
      <article
        data-print-region
        className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 sm:p-8 print:rounded-none print:border-0 print:p-0"
      >
        <header className="border-b border-slate-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {APP_NAME} · Community Safety Report
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {report.villageName}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {formatDate(report.from)} to {formatDate(report.to)} ({days} day
            {days === 1 ? "" : "s"})
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Generated {formatDateTime(report.generatedAt)}
          </p>
        </header>

        <Section title="Summary">
          <p className="text-sm leading-relaxed text-slate-700">
            <strong className="font-semibold text-slate-900">
              {report.total} report{report.total === 1 ? "" : "s"}
            </strong>{" "}
            published in this period.{" "}
            {report.previousTotal === 0
              ? "There is no comparable figure for the period before."
              : `The preceding ${days} day${days === 1 ? "" : "s"} saw ${report.previousTotal}.`}
          </p>

          <div className="mt-4 grid gap-6 sm:grid-cols-2">
            <CountTable
              heading="By category"
              rows={report.byType.map((row) => ({
                label: INCIDENT_TYPE_LABELS[row.key],
                count: row.count,
              }))}
            />
            <CountTable
              heading="By severity"
              rows={report.bySeverity.map((row) => ({
                label: SEVERITY_LABELS[row.key],
                count: row.count,
              }))}
            />
          </div>
        </Section>

        <Section title="Hotspots">
          {report.hotspots.length === 0 ? (
            <p className="text-sm text-slate-600">
              No location was named more than once in this period.
            </p>
          ) : (
            <>
              <ol className="space-y-1.5 text-sm text-slate-700">
                {report.hotspots.map((spot, index) => (
                  <li key={spot.location} className="flex gap-2">
                    <span className="tabular-nums text-slate-400">
                      {index + 1}.
                    </span>
                    <span className="flex-1">{spot.location}</span>
                    <span className="tabular-nums text-slate-600">
                      {spot.count} report{spot.count === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ol>
              <p className="mt-2 text-xs text-slate-500">
                Grouped by the landmark residents typed, so wording varies
                between reports.
              </p>
            </>
          )}
        </Section>

        <Section title="Pattern analysis" printHidden={!state.narrative}>
          {!state.narrative ? (
            <p className="text-sm text-slate-500">
              Not generated. Use the button above, or send the report without it.
            </p>
          ) : (
            <>
              <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                {state.narrative.summary}
              </p>

              {state.narrative.patterns.length > 0 && (
                <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-slate-700">
                  {state.narrative.patterns.map((note) => (
                    <li key={note} className="flex gap-2">
                      <span aria-hidden className="text-slate-400">
                        —
                      </span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              )}

              {state.narrative.recommendation && (
                <p className="mt-3 text-sm leading-relaxed text-slate-700">
                  <strong className="font-semibold">Suggested focus:</strong>{" "}
                  {state.narrative.recommendation}
                </p>
              )}

              <p className="mt-3 text-xs text-slate-500">
                {state.narrative.source === "ai"
                  ? `Written by ${state.narrative.model ?? "an AI model"} from the reports listed below. It reflects what was reported, not a police assessment.`
                  : "Assembled from the counts above. No AI summary was available when this report was produced."}
              </p>
            </>
          )}
        </Section>

        {/*
          `allowBreak`, because this is the one section that can run past a
          page. See the `break-after` note in globals.css.
        */}
        <Section title="Incident log" allowBreak>
          {report.incidents.length === 0 ? (
            <p className="text-sm text-slate-600">
              Nothing was published in this village during the period.
            </p>
          ) : (
            <>
              {/*
                A table on a wide screen and a scroll container on a narrow one.
                In print it is neither — the wrapper's scroll is unpicked so the
                rows break across pages instead of being clipped at the bottom
                of the first, and the table's `min-w-[46rem]` goes with it. 46rem
                is 736px, wider than A4's printable 190mm however the margins are
                set, so leaving it on was the overflow.

                The percentages are the column widths `table-layout: fixed`
                reads off this row — see globals.css for why fixed layout is the
                only thing that actually bounds a table. They total 100 and are
                weighted towards the report itself, which is the column carrying
                free text; the five before it carry a timestamp, a code and three
                enum labels, and none of those grows.

                **They are `LOG_COLUMNS` in `src/lib/report-pdf.tsx`**, and the
                two sets are meant to stay identical: the same report printed
                from this page and downloaded as a PDF should not come out in
                two different shapes. Tailwind needs the class as a literal, so
                they cannot be imported — change one and change the other.
                `When` and `Reference` are wider than they first were because
                the PDF's own metrics proved they had to be, and the reason is
                written up over that constant.
              */}
              <div className="-mx-1 overflow-x-auto print:mx-0 print:overflow-visible">
                <table className="w-full min-w-[46rem] border-collapse text-left text-sm print:min-w-0">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
                      <th className="py-2 pr-3 font-semibold print:w-[16%]">
                        When
                      </th>
                      <th className="py-2 pr-3 font-semibold print:w-[14%]">
                        Reference
                      </th>
                      <th className="py-2 pr-3 font-semibold print:w-[12%]">
                        Category
                      </th>
                      <th className="py-2 pr-3 font-semibold print:w-[10%]">
                        Severity
                      </th>
                      <th className="py-2 pr-3 font-semibold print:w-[14%]">
                        Location
                      </th>
                      <th className="py-2 font-semibold print:w-[34%]">
                        Report
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.incidents.map((incident) => (
                      <tr
                        key={incident.id}
                        className="border-b border-slate-100 align-top break-inside-avoid"
                      >
                        {/*
                          `whitespace-nowrap` here and on the reference below is
                          unpicked in print by globals.css — a fixed-layout
                          column cannot widen for a run it cannot break.
                        */}
                        <td className="py-2.5 pr-3 whitespace-nowrap text-slate-600">
                          {formatDateTime(incident.occurredAt)}
                        </td>
                        <td className="py-2.5 pr-3 whitespace-nowrap font-mono text-xs text-slate-600">
                          {incident.reference}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-700">
                          {INCIDENT_TYPE_LABELS[incident.type]}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-700">
                          {SEVERITY_LABELS[incident.severity]}
                        </td>
                        <td className="py-2.5 pr-3 text-slate-700">
                          {incident.locationText ?? "—"}
                        </td>
                        <td className="py-2.5 text-slate-700">
                          <span className="font-medium text-slate-900">
                            {incident.title}
                          </span>
                          <span className="mt-0.5 block leading-relaxed">
                            {incident.description}
                          </span>
                          {incident.recurring && incident.patternNote && (
                            <span className="mt-0.5 block text-xs text-slate-500">
                              Pattern: {incident.patternNote}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {report.omitted > 0 && (
                <p className="mt-3 text-xs text-slate-500">
                  {report.omitted} further report
                  {report.omitted === 1 ? "" : "s"} in this period{" "}
                  {report.omitted === 1 ? "is" : "are"} not listed. The counts,
                  breakdowns and hotspots above cover the whole period — narrow
                  the dates to see the rest.
                </p>
              )}
            </>
          )}
        </Section>

        <footer className="mt-6 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
          {/*
            "Generated by AI" only where a model actually wrote the analysis.
            `countedNarrative` is arithmetic, and a reader deciding how much of
            this document to trust off that one line should not be told a model
            wrote figures that came from `SELECT count(*)`. Same rule as the
            copied text and the PDF — `footer()` in `src/lib/community-report.ts`
            is where it is written down.
          */}
          <p>
            {GENERATED_BY}
            {state.narrative?.source === "ai" && ` ${AI_ANALYSIS_NOTE}`}{" "}
            Data controller:{" "}
            <strong className="font-semibold text-slate-700">
              {report.dataController}
            </strong>
            .
          </p>
          <p className="mt-1">
            Descriptions are anonymised before publication — personal details,
            names and registrations are removed. Locations are the landmark a
            resident named, not an address, and mapped positions are deliberately
            offset. Reports are what residents said they saw; they are not
            verified crime records.
          </p>
        </footer>
      </article>
    </>
  );
}

function Section({
  title,
  printHidden,
  allowBreak,
  children,
}: {
  title: string;
  /**
   * Drops the whole section from the printed copy, heading included.
   *
   * Only the pattern analysis uses it, and only while it has not been
   * generated. Marking the placeholder alone would print the heading with
   * nothing under it — which, in a document handed to a police officer, reads
   * as a section that failed rather than one nobody asked for.
   */
  printHidden?: boolean;
  /**
   * Lets the section be split across pages.
   *
   * Only the incident log sets it, and it has to: a village with a busy month
   * produces a section several pages tall, and `break-inside: avoid` on a box
   * that cannot fit on one page is a request the browser has to break. Some
   * engines ignore it; others move the section to a fresh page, leave the one
   * before it blank, and overflow anyway.
   *
   * The class is added rather than overridden for the same reason the widths
   * are on the `<th>`s: an opt-out that depended on `print:break-inside-auto`
   * beating `break-inside-avoid` would be resting on utility ordering.
   */
  allowBreak?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`mt-6${allowBreak ? "" : " break-inside-avoid"}`}
      data-print-hide={printHidden ? "" : undefined}
    >
      <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
        {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function CountTable({
  heading,
  rows,
}: {
  heading: string;
  rows: { label: string; count: number }[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{heading}</h3>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">None.</p>
      ) : (
        <dl className="mt-1.5 space-y-1 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex justify-between gap-4">
              <dt className="text-slate-700">{row.label}</dt>
              <dd className="tabular-nums text-slate-900">{row.count}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
