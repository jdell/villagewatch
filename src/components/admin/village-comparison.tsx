import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { ChartFrame } from "@/components/charts/chart-frame";
import { HorizontalBarChart } from "@/components/charts/lazy-charts";
import { typeChartHeight, type TypeDatum } from "@/components/charts/chart-data";

/**
 * The villages in service, ranked — the platform administrator's view of where
 * the deployment is actually being used.
 *
 * ## Why it is here and not on a coordinator's dashboard
 *
 * This is the one chart in the codebase that reads across villages, and it can
 * only live on a screen that is already unscoped. **The village is the tenant
 * boundary** (domain rule 4): every query behind `/dashboard` is narrowed to
 * the coordinator's own village, and a "how does our village compare" panel
 * there would mean handing one parish's resident numbers and report counts to
 * the coordinators of every other one. `/admin/villages` is platform-admin
 * only and is already the screen that lists every parish, so it is the one
 * place the comparison is both useful and allowed.
 *
 * A per-village version — a coordinator seeing their own figure against an
 * anonymised median — is a different feature with a different privacy
 * argument, and it is not this.
 *
 * ## A toggle rather than two series
 *
 * Residents and reports are different units. A village with 120 residents and
 * 14 reports drawn on one axis gives the second bar a stub and invites the
 * reader to conclude something from the ratio, which is a claim neither number
 * supports on its own. One metric at a time, chosen by a link — the same GET
 * idiom the tabs and the search on this page already use, so the selection
 * lands in the URL and an administrator can send somebody the view they are
 * describing.
 */

export const COMPARISON_METRICS = [
  {
    key: "residents",
    label: "Residents",
    noun: "resident",
    /** What the bar is of, said in full above the chart. */
    description: "Open accounts in each village.",
  },
  {
    key: "reports",
    label: "Reports",
    noun: "report",
    description:
      "Published reports, all time — the figure a village's own dashboard counts.",
  },
] as const;

export type ComparisonMetric = (typeof COMPARISON_METRICS)[number]["key"];

export function isComparisonMetric(
  value: string | undefined,
): value is ComparisonMetric {
  return COMPARISON_METRICS.some((metric) => metric.key === value);
}

export function VillageComparison({
  rows,
  metric,
  /** Carried through the metric links so neither selection resets the other. */
  tab,
  query,
  /** How many villages in service are not on the chart. */
  omitted,
}: {
  rows: readonly TypeDatum[];
  metric: ComparisonMetric;
  tab: string;
  query: string;
  omitted: number;
}) {
  const active =
    COMPARISON_METRICS.find((item) => item.key === metric) ??
    COMPARISON_METRICS[0];

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <BarChart3 className="size-4 text-slate-400" aria-hidden />
            Villages in service, compared
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">{active.description}</p>
        </div>

        <nav
          className="flex gap-1 rounded-lg bg-slate-100 p-1"
          aria-label="Compare by"
        >
          {COMPARISON_METRICS.map((item) => {
            const params = new URLSearchParams();
            params.set("tab", tab);
            if (query) params.set("q", query);
            params.set("metric", item.key);

            return (
              <Link
                key={item.key}
                href={`/admin/villages?${params.toString()}`}
                aria-current={item.key === metric ? "true" : undefined}
                className={
                  item.key === metric
                    ? "rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-slate-900 shadow-sm"
                    : "rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:text-slate-800"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-4">
        <ChartFrame
          rows={rows}
          emptyMessage="No village is in service yet."
          caption={`Villages in service ranked by ${active.label.toLowerCase()}`}
          labelHeading="Village"
          valueHeading={active.label}
          height={typeChartHeight(rows.length)}
        >
          <HorizontalBarChart
            rows={rows}
            unitNoun={active.noun}
            seriesLabel={active.label}
          />
        </ChartFrame>
      </div>

      {/*
        Said rather than trimmed. A ranked chart showing ten of forty villages
        with nothing to say so reads as a deployment with ten villages in it —
        the police sync's rule about a capped run, on the screen where the
        person reading it is deciding where to spend their attention.
      */}
      {omitted > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          The {rows.length} highest are shown. {omitted} more{" "}
          {omitted === 1 ? "village is" : "villages are"} in service and not on
          this chart.
        </p>
      )}
    </section>
  );
}
