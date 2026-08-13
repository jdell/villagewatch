import type { Metadata } from "next";
import Link from "next/link";
import { CalendarRange, LayoutDashboard, TriangleAlert } from "lucide-react";
import { NoVillage } from "@/components/no-village";
import { ReportView } from "@/components/reports/report-view";
import { requireCoordinator } from "@/lib/auth";
import { getVillageController } from "@/lib/villages";
import { DATA_CONTROLLER, REPORT_RANGES } from "@/lib/constants";
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
 * `searchParams` is a Promise in Next.js 16 — awaited, never destructured in
 * the signature.
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

  const village = await getVillageController(villageId);

  if (!village) return <NoVillage />;

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

  const custom = range.preset === "custom";

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
          <p className="mt-1 text-sm text-slate-500">
            A written report of what your village has published, for your PCSO
            or parish council.
          </p>
        </div>

        <Link
          href="/dashboard"
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
        >
          <LayoutDashboard className="size-4" aria-hidden />
          Dashboard
        </Link>
      </div>

      {/*
        `DATA_CONTROLLER` is placeholders until somebody fills it in, and
        `Village.parishCouncil` is what replaces it per village. A report whose
        footer names "[Parish Council name]" is a document a coordinator would
        send to the police without noticing, so it says so here rather than only
        in the footer of the thing they are about to print.
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
              &ldquo;{report.dataController}&rdquo;. Ask your platform
              administrator to set the parish council on your village before you
              send this to anyone outside the village.
            </p>
          </div>
        </div>
      )}

      <form
        method="get"
        className="mt-6 rounded-2xl border border-slate-200 bg-white p-4"
        data-print-hide
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-44 flex-1">
            <label
              htmlFor="report-range"
              className="block text-sm font-medium text-slate-700"
            >
              Period
            </label>
            <select
              id="report-range"
              name="range"
              defaultValue={range.preset}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              {REPORT_RANGES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {/*
            Both date inputs are always rendered and always submitted. Hiding
            them behind the "Custom" option would need JavaScript to reveal, and
            the point of a GET form is that it works without any; carrying them
            costs two query parameters that `resolveReportRange` ignores unless
            `range=custom`.
          */}
          <div className="min-w-36 flex-1">
            <label
              htmlFor="report-from"
              className="block text-sm font-medium text-slate-700"
            >
              From
            </label>
            <input
              id="report-from"
              name="from"
              type="date"
              defaultValue={range.fromValue}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <div className="min-w-36 flex-1">
            <label
              htmlFor="report-to"
              className="block text-sm font-medium text-slate-700"
            >
              To
            </label>
            <input
              id="report-to"
              name="to"
              type="date"
              defaultValue={range.toValue}
              className="mt-1.5 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <button
            type="submit"
            className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <CalendarRange className="size-4" aria-hidden />
            Build report
          </button>
        </div>

        <p className="mt-2.5 text-xs text-slate-500">
          {custom
            ? "The dates are inclusive. Pick “Custom range” to use them."
            : "Pick “Custom range” above to use the dates."}
          {" "}
          Published and resolved reports only — nothing still waiting for review,
          and nothing you turned down.
        </p>

        {range.notice && (
          <p className="mt-2 text-xs font-medium text-amber-700">
            {range.notice}
          </p>
        )}
      </form>

      <ReportView
        report={report}
        villageId={villageId}
        rangeFields={{
          range: range.preset,
          from: range.fromValue,
          to: range.toValue,
        }}
      />
    </div>
  );
}
