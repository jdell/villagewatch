import { TrendingUp } from "lucide-react";
import { ChartFrame } from "@/components/charts/chart-frame";
import {
  HorizontalBarChart,
  IncidentTrendChart,
} from "@/components/charts/lazy-charts";
import { typeChartHeight, type TypeDatum } from "@/components/charts/chart-data";
import type { SeriesBucket } from "@/lib/charts/series";

/**
 * What has been happening in the village, for a resident rather than a
 * coordinator.
 *
 * ## It carries counts and nothing else
 *
 * Two charts — when reports came in, and what they were — built from
 * `groupBy`-style counts over published reports. **There is no field on either
 * of them that could carry anything about a person**: no reporter, no title, no
 * description, no coordinates, not even an incident id. That is the same
 * structural guard `SocialIncident` uses for the public weekly post, and it is
 * here for a softer version of the same reason — this screen is every resident
 * of the village rather than the handful who moderate it.
 *
 * A category and a count is strictly less than the list underneath it already
 * shows, which is what makes this safe to put in front of everybody: it is the
 * same reports, summarised.
 *
 * ## It is behind the session, and deliberately not a public page
 *
 * The brief offered "a public stats page" as an alternative. It is not taken:
 * the village is the tenant boundary (domain rule 4) and a page outside the
 * session would publish one parish's activity to anyone who asked, on a timer,
 * with nobody deciding. The service already has a way to put a village's week
 * in public — `GET /api/digest/social`, which a **coordinator** copies and
 * pastes, having read it first. That is a person taking responsibility for a
 * disclosure each time, and it is the shape this product has chosen. An
 * automatic public feed would quietly replace it.
 *
 * ## It follows the period control it sits under
 *
 * The same `TimeRange` the list below is filtered by, so the charts and the
 * cards under them are one answer rather than two. A summary showing a
 * different span from the list it heads would be worse than no summary.
 */

export function VillageSummary({
  trend,
  trendLabel,
  byType,
  periodLabel,
}: {
  trend: readonly SeriesBucket[];
  trendLabel: string;
  byType: readonly TypeDatum[];
  periodLabel: string;
}) {
  // Nothing published in the period. The list below says so in a sentence
  // already, and two empty frames saying it again in pictures is furniture.
  if (byType.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <TrendingUp className="size-4 text-slate-400" aria-hidden />
        Your village at a glance
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Published reports {periodLabel.toLowerCase()}, counted. No names, no
        addresses — the same reports listed below.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-xs font-medium text-slate-600">
            When they came in
          </h3>
          <div className="mt-2">
            <ChartFrame
              rows={trend.map((bucket) => ({
                label: bucket.label,
                value: bucket.count,
              }))}
              emptyMessage="Nothing has been published in this period."
              caption={`Published reports ${trendLabel}, ${periodLabel.toLowerCase()}`}
              labelHeading="Period"
              height={180}
            >
              <IncidentTrendChart buckets={trend} />
            </ChartFrame>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-medium text-slate-600">
            What was reported
          </h3>
          <div className="mt-2">
            <ChartFrame
              rows={byType}
              emptyMessage="Nothing has been published in this period."
              caption={`Published reports by category, ${periodLabel.toLowerCase()}`}
              labelHeading="Category"
              height={typeChartHeight(byType.length)}
            >
              <HorizontalBarChart
                rows={byType}
                unitNoun="report"
                seriesLabel="Reported"
              />
            </ChartFrame>
          </div>
        </div>
      </div>
    </section>
  );
}
