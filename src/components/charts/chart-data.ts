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
