"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import type { SeverityDatum } from "@/components/charts/chart-data";
import { TOOLTIP_STYLE } from "@/components/charts/chart-theme";

/**
 * How serious the period's reports were, as a doughnut with its key beside it.
 *
 * ## Why a doughnut is defensible here when it usually is not
 *
 * A pie is a poor way to compare quantities and a worse way to compare more
 * than about five of them. What makes it right for this one figure is that the
 * question is a *composition* — "how much of what we are getting is serious" —
 * and there are exactly four levels, ordered, each with a colour a resident has
 * already learned from the map pins and the severity badges. The hole is where
 * the total goes, which is the number the reader wants first and the one a pie
 * cannot state.
 *
 * The counts are not left to the angles: the key beside the chart carries the
 * label, the count and the share as text, so nobody has to estimate an arc. On
 * a narrow screen the key sits under the chart rather than beside it.
 *
 * ## The colours come from `SEVERITY_META`
 *
 * The same `pin` values the map draws and the badges fill, passed in by the
 * page. A palette local to this component would mean a HIGH report reading red
 * on the map and something else on the dashboard, which is the sort of drift
 * that makes somebody distrust both.
 */

export function SeverityDonut({
  rows,
  total,
}: {
  rows: readonly SeverityDatum[];
  total: number;
}) {
  return (
    <div className="flex h-full flex-col items-center gap-4 sm:flex-row">
      <div className="relative h-full w-full max-w-[13rem] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={[...rows]}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="92%"
              // Twelve o'clock, clockwise — the order the key reads in.
              startAngle={90}
              endAngle={-270}
              paddingAngle={rows.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {rows.map((row) => (
                <Cell key={row.key} fill={row.colour} />
              ))}
            </Pie>

            <Tooltip
              {...TOOLTIP_STYLE}
              cursor={false}
              formatter={(value, name) => [
                typeof value === "number"
                  ? `${value} report${value === 1 ? "" : "s"}`
                  : "No reports",
                String(name),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>

        {/*
          The total, in the hole. `pointer-events-none` so it never swallows a
          hover meant for the ring underneath it — the label sits over the
          chart's own centre, which is inside its hit area.
        */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums text-slate-900">
            {total}
          </span>
          <span className="text-xs text-slate-500">
            report{total === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <ul className="w-full space-y-2">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2.5 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.colour }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-slate-700">
              {row.label}
            </span>
            <span className="shrink-0 tabular-nums font-medium text-slate-900">
              {row.value}
            </span>
            <span className="w-10 shrink-0 text-right tabular-nums text-xs text-slate-500">
              {total === 0 ? "—" : `${Math.round((row.value / total) * 100)}%`}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
