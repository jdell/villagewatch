"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { SeriesBucket } from "@/lib/charts/series";
import {
  CHART_BRAND,
  CHART_BRAND_STRONG,
  CHART_GRID,
  TICK_STYLE,
  TOOLTIP_STYLE,
} from "@/components/charts/chart-theme";

/**
 * Published reports over the selected period — the one chart on the Overview
 * tab that CSS bars genuinely could not draw, and the reason this codebase took
 * a charting dependency at all.
 *
 * It answers the question a coordinator is actually asked at a parish meeting:
 * is this getting better or worse. The breakdowns beside it answer "what" and
 * "how serious"; neither of them answers "when", and a shape over time is not
 * something a reader can assemble from a list of totals.
 *
 * ## An area rather than a line
 *
 * At village scale most buckets are single digits and several are zero, so a
 * bare line through them reads as noise — the eye follows the zig-zag rather
 * than the level. The fill gives the series a baseline to sit on, which is what
 * makes "two a week, then six" legible at this size. `type="monotone"` is
 * deliberately *not* used: a spline through sparse counts invents curvature
 * between points, dipping below zero on the way out of a spike and implying
 * reports that were never filed. Straight segments claim only what was counted.
 *
 * ## Every bucket is present, including the empty ones
 *
 * `buildSeries` fills the gaps before this ever sees them — see the header of
 * `src/lib/charts/series.ts` for why a missing bucket is the dangerous case
 * rather than the tidy one.
 */

/**
 * The narrowest gap, in pixels, the axis will leave between two printed ticks.
 *
 * **Measured rather than counted, and that is the fix rather than the tidy
 * version.** The first pass thinned by index — every nth bucket, from a divisor
 * chosen against a number of points. That works at one width and one width
 * only: the same card is about 700px on a laptop and 290px on an iPhone in
 * portrait, so a divisor that reads well on the first drew "w/c 15 Ju",
 * "w/c 29 Ju" and "w/c 13 Ju" straight through each other on the second.
 * Recharts measures the rendered labels against this and drops whichever will
 * not fit, so the axis thins itself as the card narrows.
 *
 * 28 is a `w/c 15 Sept` at 11px plus a gap — the longest label the three
 * granularities produce.
 */
const MIN_TICK_GAP = 28;

export function IncidentTrendChart({
  buckets,
}: {
  buckets: readonly SeriesBucket[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={[...buckets]}
        /*
          Ticks are centred on their point and the outermost points sit on the
          plot's own edges, so half of the first and last labels hangs past it.
          The right margin is that overhang; on the left the Y axis's own width
          already provides it, which is why this does not pull the plot left
          with a negative margin the way a chart with no edge labels could.
        */
        margin={{ top: 4, right: 24, bottom: 0, left: 0 }}
      >
        <defs>
          <linearGradient id="vw-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CHART_BRAND} stopOpacity={0.28} />
            <stop offset="100%" stopColor={CHART_BRAND} stopOpacity={0.02} />
          </linearGradient>
        </defs>

        {/* Horizontal only. Vertical lines on a sparse series read as buckets
            that are not there. */}
        <CartesianGrid stroke={CHART_GRID} vertical={false} />

        <XAxis
          dataKey="label"
          // Both ends always printed — they are what say which period the chart
          // covers — and everything between them subject to the gap above.
          interval="preserveStartEnd"
          minTickGap={MIN_TICK_GAP}
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={{ stroke: CHART_GRID }}
        />

        {/* `allowDecimals={false}` because the axis counts reports. Without it
            a quiet period is labelled 0, 0.5, 1 — half a report. */}
        <YAxis
          allowDecimals={false}
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={false}
          // Narrow, because it only ever prints a count of reports — and it is
          // also the left-hand room the first X tick borrows.
          width={36}
        />

        <Tooltip
          {...TOOLTIP_STYLE}
          // Recharts types the value as "whatever the series held", so the
          // narrowing is done here rather than asserted — a series that ever
          // carries a gap reaches this as undefined.
          formatter={(value) => [
            typeof value === "number"
              ? `${value} report${value === 1 ? "" : "s"}`
              : "No reports",
            // The bucket's own label is already the tooltip's title, so naming
            // the series "Week beginning" here would print the period twice.
            "Reported",
          ]}
        />

        <Area
          dataKey="count"
          stroke={CHART_BRAND_STRONG}
          strokeWidth={2}
          fill="url(#vw-trend-fill)"
          // Dots on 31 daily buckets is a caterpillar; on 5 it is what makes
          // the points readable as counts rather than as a shape.
          dot={buckets.length <= 12}
          activeDot={{ r: 4 }}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
