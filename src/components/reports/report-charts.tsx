import { ChartFrame } from "@/components/charts/chart-frame";
import {
  HorizontalBarChart,
  IncidentTrendChart,
  SeverityDonut,
} from "@/components/charts/lazy-charts";
import {
  SEVERITY_RING_HEIGHT,
  severityChartHeight,
  typeChartHeight,
  type SeverityDatum,
  type TypeDatum,
} from "@/components/charts/chart-data";
import type { SeriesBucket } from "@/lib/charts/series";

/**
 * The period report's three pictures: when it happened, what it was, and how
 * serious.
 *
 * ## It is the dashboard's charts, not a second set
 *
 * Every component here is the one Overview renders — `IncidentTrendChart`,
 * `HorizontalBarChart`, `SeverityDonut` — through the same `ChartFrame` and the
 * same lazy boundary. Two sets would be two answers to "what was reported",
 * drifting apart the first time somebody fixed one, and a coordinator reads
 * both screens about the same village in the same week.
 *
 * The **data** is the report's own, though, and that matters more than the
 * components: `byType` and `bySeverity` come straight off `collectVillageReport`,
 * so the chart and the table under it are the same query. A chart that ran its
 * own count would eventually disagree with the figures beside it, in a document
 * that goes to a police officer.
 *
 * ## Inside the print region, and asking for its colour back
 *
 * These sit inside `ReportView`'s `[data-print-region]`, so Ctrl+P puts them on
 * the paper with the rest of the report. Every frame is `printable`, which is
 * what opts them out of the black-on-white rule the printed report otherwise
 * follows — for a chart the colour is the reading rather than decoration. See
 * `ChartFrame`'s `printable` prop.
 *
 * **They are not in the downloaded PDF.** `GET /api/reports/[villageId]/pdf` is
 * rendered by `@react-pdf/renderer`, a different engine with no DOM and no
 * Recharts in it — putting charts there means drawing them again as react-pdf
 * primitives, which is a separate piece of work rather than a prop. The note
 * under the download button is where a coordinator is told which of the two
 * they are getting.
 */

export function ReportCharts({
  trend,
  trendLabel,
  byType,
  bySeverity,
  periodLabel,
}: {
  trend: readonly SeriesBucket[];
  /** "by day" / "by week" / "by month", from the granularity the query chose. */
  trendLabel: string;
  byType: readonly TypeDatum[];
  bySeverity: readonly SeverityDatum[];
  periodLabel: string;
}) {
  const severityTotal = bySeverity.reduce((sum, row) => sum + row.value, 0);

  // Nothing was published, so there are three empty frames to draw and no
  // reason to draw them — the report's own summary already says the period is
  // empty, in a sentence rather than in three captions repeating it.
  if (trend.length === 0 && byType.length === 0) return null;

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-xl border border-slate-200 p-4 print:rounded-none print:border-0 print:p-0">
        <h3 className="text-sm font-semibold text-slate-900">
          When reports came in
        </h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Published reports {trendLabel}, {periodLabel.toLowerCase()}.
        </p>
        <div className="mt-3">
          <ChartFrame
            rows={trend.map((bucket) => ({
              label: bucket.label,
              value: bucket.count,
            }))}
            emptyMessage="Nothing was published in this period."
            caption={`Published reports ${trendLabel}`}
            labelHeading="Period"
            height={200}
            printable
          >
            <IncidentTrendChart buckets={trend} />
          </ChartFrame>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
        <div className="rounded-xl border border-slate-200 p-4 print:rounded-none print:border-0 print:p-0">
          <h3 className="text-sm font-semibold text-slate-900">
            What was reported
          </h3>
          <div className="mt-3">
            <ChartFrame
              rows={byType}
              emptyMessage="Nothing was published in this period."
              caption="Published reports by category"
              labelHeading="Category"
              height={typeChartHeight(byType.length)}
              printable
            >
              <HorizontalBarChart
                rows={byType}
                unitNoun="report"
                seriesLabel="Reported"
              />
            </ChartFrame>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 p-4 print:rounded-none print:border-0 print:p-0">
          <h3 className="text-sm font-semibold text-slate-900">How serious</h3>
          <div className="mt-3">
            <ChartFrame
              rows={bySeverity}
              emptyMessage="Nothing was published in this period."
              caption="Published reports by severity"
              labelHeading="Severity"
              height={SEVERITY_RING_HEIGHT}
              stackedHeight={severityChartHeight(bySeverity.length)}
              printable
            >
              <SeverityDonut rows={bySeverity} total={severityTotal} />
            </ChartFrame>
          </div>
        </div>
      </div>
    </div>
  );
}
