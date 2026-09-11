"use client";

import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import type { SeriesBucket } from "@/lib/charts/series";
import {
  CHART_BRAND,
  CHART_TICK,
  TOOLTIP_STYLE,
} from "@/components/charts/chart-theme";

/**
 * One column per day, above the activity feed — what the village's last few
 * weeks have looked like.
 *
 * ## It is not the trend chart at a shorter period
 *
 * The trend chart follows the period control and answers "is this getting
 * better or worse". This is fixed to a trailing window and answers "what have I
 * missed", which is the activity feed's own question — and it is **deliberately
 * not bounded by the period** for the feed's own reason: a coordinator who
 * narrowed to seven days to read their queue should not find the strip above it
 * claiming the village went quiet. The heading names the window, the way the
 * "waiting for review" card names "all time", so the exception is visible
 * rather than inferred.
 *
 * ## No axes
 *
 * A sparkline with a Y axis is a small chart pretending to be a large one.
 * Everything a reader needs is either in the shape or in the tooltip, and the
 * exact counts are in the table `ChartFrame` renders. The X axis is present but
 * draws no line and no ticks — it exists so the first and last day are named,
 * which is what makes the strip a period rather than a pattern.
 */

export function ActivitySparkline({
  buckets,
}: {
  buckets: readonly SeriesBucket[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart
        data={[...buckets]}
        margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
        barCategoryGap={1}
      >
        {/*
          `interval={0}` with only the ends given text: Recharts thins ticks by
          index, which on thirty columns would label an arbitrary middle day.
          Naming the ends says what the strip covers and nothing more.
        */}
        <XAxis
          dataKey="label"
          interval={0}
          tickLine={false}
          axisLine={false}
          height={20}
          tick={({ x, y, payload, index }) => (
            <text
              x={x}
              y={Number(y) + 10}
              textAnchor={index === 0 ? "start" : "end"}
              fill={CHART_TICK}
              fontSize={10}
            >
              {index === 0 || index === buckets.length - 1
                ? payload.value
                : ""}
            </text>
          )}
        />

        <Tooltip
          {...TOOLTIP_STYLE}
          formatter={(value) => [
            typeof value === "number"
              ? `${value} report${value === 1 ? "" : "s"}`
              : "No reports",
            "Reported",
          ]}
        />

        <Bar
          dataKey="count"
          fill={CHART_BRAND}
          radius={[2, 2, 0, 0]}
          // A day with nothing in it still gets a sliver, so the strip reads as
          // thirty days rather than as however many had something on them.
          minPointSize={2}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
