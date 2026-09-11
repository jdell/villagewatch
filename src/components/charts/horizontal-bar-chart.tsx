"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TypeDatum } from "@/components/charts/chart-data";
import {
  CHART_BRAND,
  CHART_GRID,
  TICK_STYLE,
  TOOLTIP_STYLE,
} from "@/components/charts/chart-theme";

/**
 * A ranked single-series bar chart, laid out horizontally. Two screens use it:
 * the Overview tab's "what was reported", and the village comparison on
 * `/admin/villages`.
 *
 * ## Horizontal, and that is the whole reason it is worth a chart
 *
 * Both callers label their rows with words rather than codes — "Antisocial
 * behaviour", "Suspicious activity", and parish names like "Histon and
 * Impington". On a vertical axis those are unreadable at any width a phone has:
 * they rotate, they truncate, or they wrap into each other. Laid along the Y
 * axis they are read left to right at full length, which is what a label made
 * of words needs.
 *
 * ## It replaced CSS bars, and the count is still text
 *
 * `BreakdownBar` drew the first of these without a dependency, and its header
 * argued — fairly — that a single-series bar chart of a dozen rows is something
 * CSS already does. What it could not do is carry a tooltip or sit beside a
 * chart on a shared visual footing, and the dependency is paid for by the trend
 * chart either way. The promise it was making is kept by `ChartFrame`, which
 * renders the same numbers as a table; see that component's header.
 *
 * `BreakdownBar` itself stays, and should: `police-crime-panel.tsx` uses it,
 * where the Home Office figures beside a village's own are deliberately two
 * counts rather than one chart.
 *
 * ## One series only
 *
 * There is no grouped variant and adding one would need an argument this
 * component cannot make for its callers. Two series on a shared axis have to be
 * in the same unit to mean anything — residents against reports is a hundred
 * against a dozen, which draws the second as a stub and says nothing. The
 * admin screen offers a metric toggle instead, for exactly that reason.
 */

export function HorizontalBarChart({
  rows,
  /** Singular noun the tooltip counts — "report", "resident". */
  unitNoun,
  /** What the tooltip calls the series. */
  seriesLabel,
}: {
  rows: readonly TypeDatum[];
  unitNoun: string;
  seriesLabel: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={[...rows]}
        layout="vertical"
        margin={{ top: 0, right: 28, bottom: 0, left: 0 }}
        barCategoryGap={6}
      >
        {/* Vertical only — the grid lines have to run along the bars to be
            worth anything on a horizontal chart. */}
        <CartesianGrid stroke={CHART_GRID} horizontal={false} />

        <XAxis
          type="number"
          allowDecimals={false}
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={false}
        />

        <YAxis
          type="category"
          dataKey="label"
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={false}
          // Wide enough for "Antisocial behaviour" at 11px without truncation,
          // which is the longest label `IncidentType` can produce. A village
          // name longer than that truncates with an ellipsis rather than
          // pushing the plot off the card — the table underneath carries it in
          // full either way.
          width={132}
        />

        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value) => [
            typeof value === "number"
              ? `${value} ${unitNoun}${value === 1 ? "" : "s"}`
              : `No ${unitNoun}s`,
            seriesLabel,
          ]}
        />

        <Bar
          dataKey="value"
          fill={CHART_BRAND}
          radius={[0, 4, 4, 0]}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
