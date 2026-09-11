/**
 * The shapes the charts are fed, and the one measurement a page has to make
 * before it can size a box.
 *
 * **It imports nothing.** That is the whole reason it exists: the chart
 * components are `"use client"` and pull Recharts in behind them, so a Server
 * Component importing a *value* from one of those files — `typeChartHeight`
 * was the case — puts the library back in the route's own bundle and silently
 * undoes the deferral in `lazy-charts.tsx`. Types are erased and would have
 * been safe; a function is not, and the failure is invisible short of reading
 * the built chunks.
 */

/** One row of a chart, as `ChartFrame` renders it into the table. */
export type ChartDatum = {
  /** Row label — an axis tick, a slice, a bucket. */
  label: string;
  /** What the chart plots. `null` is a gap rather than a zero. */
  value: number | null;
};

/** A category and its count, for the horizontal bar chart. */
export type TypeDatum = {
  label: string;
  value: number;
};

/** A severity level, its count and the colour the map already gives it. */
export type SeverityDatum = {
  key: string;
  label: string;
  value: number;
  /** `SEVERITY_META[level].pin`. */
  colour: string;
};

/**
 * Per-row height, in pixels, and the vertical padding around the plot.
 *
 * The category chart grows with its rows rather than squeezing them into a
 * fixed box: `IncidentType` has seventeen members, and at a fixed height each
 * bar gets four pixels and the labels overlap — the state a charting library
 * fails into without complaining.
 */
const ROW_HEIGHT = 30;
const CHART_PADDING = 24;

export function typeChartHeight(rows: number): number {
  return rows * ROW_HEIGHT + CHART_PADDING;
}

/**
 * The doughnut's ring, in pixels. The same at every width — it is a circle, and
 * a circle that changed size with the viewport would change how big a slice
 * looks rather than how much of one there is.
 */
export const SEVERITY_RING_HEIGHT = 208;

/**
 * One legend row, the gap between two of them, and the gap above the legend
 * when it sits under the ring. All measured against the rendered component
 * rather than derived from the utilities — a `text-sm` line box, `space-y-2`
 * and `gap-4` respectively.
 *
 * **The row height is only a constant because the label cannot wrap.** It is
 * `truncate`, so "Antisocial behaviour"-length text would be clipped rather
 * than run onto a second line and make the legend taller than what was
 * reserved for it. Take the truncation off and this arithmetic stops being
 * true — which is the fault this whole function exists to fix.
 */
const LEGEND_ROW_HEIGHT = 20;
const LEGEND_ROW_GAP = 8;
const LEGEND_GAP = 16;

/**
 * How tall the severity card has to be when the ring and its key **stack**.
 *
 * Below `sm` they sit one above the other, so the card needs both — and the
 * count of rows is not fixed, because a level with nothing in it is dropped
 * (four empty rows on a quiet month is noise). Reserving for four would leave
 * dead space under a village with only `LOW` reports; reserving for the ring
 * alone is what put the key on top of the panel below it.
 *
 * The same shape as `typeChartHeight`: the page knows how many rows it has, so
 * the arithmetic belongs here and the magic numbers do not belong in the page.
 */
export function severityChartHeight(rows: number): number {
  if (rows === 0) return SEVERITY_RING_HEIGHT;

  // `space-y-2` puts a gap *between* rows, so four rows carry three of them.
  // Counting one per row over-reserves by a gap, which is harmless and wrong.
  const legend = rows * LEGEND_ROW_HEIGHT + (rows - 1) * LEGEND_ROW_GAP;

  return SEVERITY_RING_HEIGHT + LEGEND_GAP + legend;
}
