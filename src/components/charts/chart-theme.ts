/**
 * The few colours and axis settings every chart shares.
 *
 * Written out as hex rather than read from Tailwind's custom properties, which
 * is the duplication `report-pdf.tsx` and `opengraph-image.tsx` already carry
 * and it has the same failure mode: a change to the palette in `globals.css`
 * does not follow. It is unavoidable here for the same reason it is there —
 * these are SVG `fill` and `stroke` attributes handed to a library, not classes
 * a compiler can see.
 *
 * Severity is the exception and must stay one: those colours come from
 * `SEVERITY_META[...].pin` in `constants.ts`, the same values the map pins and
 * the severity badges use. A second severity palette local to the charts would
 * mean a HIGH report reading one colour on the dashboard and another on the map.
 */

/** `--color-brand-500` / `-600`. The single-series colour. */
export const CHART_BRAND = "#3b82f6";
export const CHART_BRAND_STRONG = "#2563eb";

/** Tailwind `slate-200`, `-400` and `-500`. Grid, ticks and labels. */
export const CHART_GRID = "#e2e8f0";
export const CHART_TICK = "#94a3b8";
export const CHART_LABEL = "#64748b";

/**
 * What every axis tick looks like.
 *
 * `fontSize` is a number rather than a Tailwind class because it is an SVG
 * presentation attribute — a `text-xs` on the container does not reach the
 * `<text>` elements Recharts emits.
 */
export const TICK_STYLE = {
  fill: CHART_TICK,
  fontSize: 11,
} as const;

/**
 * The tooltip's own box.
 *
 * Matches the cards it sits on — `rounded-xl`, a slate ring and the same
 * shadow — because a chart library's default tooltip is the one part of a chart
 * that looks obviously borrowed.
 */
export const TOOLTIP_STYLE = {
  contentStyle: {
    borderRadius: "0.75rem",
    border: "1px solid #e2e8f0",
    boxShadow: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
    fontSize: "0.8125rem",
    padding: "0.5rem 0.75rem",
  },
  labelStyle: { color: "#0f172a", fontWeight: 600, marginBottom: "0.125rem" },
  itemStyle: { color: "#334155", padding: 0 },
  cursor: { fill: "#f1f5f9" },
} as const;
