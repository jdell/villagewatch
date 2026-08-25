import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard, TriangleAlert } from "lucide-react";
import { NoVillage } from "@/components/no-village";
import { ReportPeriodPicker } from "@/components/reports/report-period-picker";
import { ReportView } from "@/components/reports/report-view";
import { WeeklySummaryHistory } from "@/components/reports/weekly-summary-history";
import { requireCoordinator } from "@/lib/auth";
import { getVillageController, getVillageMode } from "@/lib/villages";
import {
  DATA_CONTROLLER,
  WEEKLY_SUMMARY_HISTORY_SIZE,
} from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { dateInputValue } from "@/lib/date-range";
import { collectVillageReport, resolveReportRange } from "@/lib/reports";

export const metadata: Metadata = { title: "Reports" };

/**
 * The community safety report a coordinator takes to a police liaison meeting
 * or a parish council.
 *
 * Coordinators only — `requireCoordinator()` is the gate, and the sidebar link
 * being hidden from residents is not one. Scoped to the coordinator's own
 * village through the session profile, never a village id from the URL
 * (domain rule 4).
 *
 * ## The date range is a GET form
 *
 * Same reasoning as the incident list's filters. It costs a round trip that
 * client-side state would not and buys three things worth more: it works before
 * JavaScript loads, every period is a shareable and bookmarkable URL — which
 * matters when the same report is produced every month — and the range is
 * applied by the query that enforces the village and status scoping rather than
 * after it.
 *
 * The controls themselves are `ReportPeriodPicker`, which is a Client Component
 * around the same `<form method="get">`: a preset and a submit button, with the
 * dates on screen only when "Custom range" is the preset. Every preset still
 * works with no JavaScript at all.
 *
 * `searchParams` is a Promise in Next.js 16 — awaited, never destructured in
 * the signature.
 *
 * ## Who the report is for depends on the village
 *
 * `Village.mode` decides it. A council village's report goes to a PCSO or the
 * council; a community village's goes into the group's own records, and its
 * coordinator is the data controller named in the footer. One read, one
 * sentence, and the amber warning below says the same thing both ways.
 *
 * ## What renders immediately, and what costs a button
 *
 * Everything but the pattern analysis. The counts, the hotspots and the log are
 * database queries; the analysis is an Anthropic call over a month of a
 * village's reports, and a page that spent it on every render would spend it
 * again on every change of date, every refresh and every back button. See
 * `./actions.ts`, which is also where the audit row is written.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireCoordinator("/reports");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  const params = await searchParams;
  const range = resolveReportRange(params);

  /*
    `mode` is its own read rather than a column on `getVillageController`. That
    function's whole shape is a retry that drops `parish_council` when the
    database is missing it, and adding a second new column to the same SELECT
    would mean a database missing `mode` losing the council name as well — an
    amber warning about an unnamed data controller on a village that has named
    one. See `getVillageMode`.
  */
  const [village, mode, weeklySummaries] = await Promise.all([
    getVillageController(villageId),
    getVillageMode(villageId),
    /*
      The weekly digests this village has already had.

      `GET|POST /api/digest` has written one `PatternAlert` per active village
      per run since Day 6 and nothing has ever rendered one. This is the reading
      half of it, and it is here rather than on Overview because it is a set of
      documents rather than a figure — the same reason the period report is
      here.

      Village-scoped like every other query (domain rule 4). Read-only:
      `acknowledgedAt` and `dismissedAt` still have no UI, and adding one in
      passing to a list that is otherwise inert is not a decision to make here.
    */
    prisma.patternAlert.findMany({
      where: { villageId },
      select: {
        id: true,
        title: true,
        summary: true,
        type: true,
        severity: true,
        incidentCount: true,
        windowStart: true,
        windowEnd: true,
        detector: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: WEEKLY_SUMMARY_HISTORY_SIZE,
    }),
  ]);

  if (!village) return <NoVillage />;

  const council = mode === "council";

  const collected = await collectVillageReport({
    villageId,
    villageName: village.name,
    parishCouncil: village.parishCouncil,
    range,
  });

  /*
    `range` stays on the server. It is the only field on the collected report
    carrying `Date` objects rather than ISO strings, and the Client Component
    below has no use for it — the period it renders comes from `from` and `to`,
    and the period the action re-derives comes from the three form fields.
  */
  const { range: _serverOnly, ...report } = collected;
  void _serverOnly;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <div
        className="flex flex-wrap items-start justify-between gap-4"
        data-print-hide
      >
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Reports
          </h1>
          {/*
            Who the document is *for* depends on `Village.mode`. Most villages
            have no council behind them — the community model is the default —
            and telling a volunteer with six neighbours and a WhatsApp group
            that this is for their parish council is describing somebody else's
            village to them. See "The two compliance models" in `CLAUDE.md`.
          */}
          <p className="mt-1 text-sm text-slate-500">
            A written report of what your village has published, for{" "}
            {council ? "your PCSO or parish council" : "your community records"}
            .
          </p>
        </div>

        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <LayoutDashboard className="size-4" aria-hidden />
          Overview
        </Link>
      </div>

      {/*
        `DATA_CONTROLLER` is placeholders until somebody fills it in, and
        `Village.parishCouncil` is what replaces it per village. A report whose
        footer names "[Data controller name]" is a document a coordinator would
        send to the police without noticing, so it says so here rather than only
        in the footer of the thing they are about to print.

        Both halves of the sentence were wrong for a community village: the
        controller there is the coordinator reading this rather than a council,
        and the field has not been platform-admin-only since `/dashboard` grew
        one. It names the person who can actually fix it, and links to where.
      */}
      {report.dataController === DATA_CONTROLLER.name && (
        <div
          className="mt-4 flex gap-3 rounded-xl bg-amber-50 p-3.5 ring-1 ring-inset ring-amber-600/20"
          data-print-hide
        >
          <TriangleAlert className="size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm leading-relaxed text-amber-900">
            <p className="font-medium">No data controller is named yet</p>
            <p className="mt-1 text-amber-800">
              The footer of this report will read
              &ldquo;{report.dataController}&rdquo;.{" "}
              {council
                ? "Name your parish council in"
                : "Your village runs the community model, so you are the data controller — put your group’s name in"}{" "}
              <Link
                href="/dashboard/settings#village-profile"
                className="font-medium underline underline-offset-2"
              >
                village settings
              </Link>{" "}
              before you send this to anyone outside the village.
            </p>
          </div>
        </div>
      )}

      {/*
        `today` is the server's, not the browser's. It is the bound the picker's
        grid enforces and the clock `resolveReportRange` clamps against, and
        reading it off `new Date()` inside a Client Component would be a
        different answer on each side of hydration. See the component header.
      */}
      <ReportPeriodPicker
        preset={range.preset}
        from={range.fromValue}
        to={range.toValue}
        today={dateInputValue(new Date())}
        notice={range.notice}
      />

      <ReportView
        report={report}
        villageId={villageId}
        rangeFields={{
          range: range.preset,
          from: range.fromValue,
          to: range.toValue,
        }}
      />

      {/*
        Below the report, and outside the print region — this is a record a
        coordinator reads back over, not part of the document they send. It is
        `data-print-hide` for the same reason the period picker is: Ctrl+P on
        this page should produce the report and nothing else.
      */}
      <WeeklySummaryHistory
        summaries={weeklySummaries.map((summary) => ({
          id: summary.id,
          title: summary.title,
          summary: summary.summary,
          type: summary.type,
          severity: summary.severity,
          incidentCount: summary.incidentCount,
          windowStart: summary.windowStart.toISOString(),
          windowEnd: summary.windowEnd.toISOString(),
          detector: summary.detector,
          createdAt: summary.createdAt.toISOString(),
        }))}
      />
    </div>
  );
}
