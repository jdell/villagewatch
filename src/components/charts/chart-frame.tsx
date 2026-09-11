import type { CSSProperties, ReactNode } from "react";
import type { ChartDatum } from "@/components/charts/chart-data";

/**
 * The shell every chart on these screens renders inside: an empty state, and
 * the numbers as a table for anybody the picture does not reach.
 *
 * ## The table is not a nicety
 *
 * `BreakdownBar` — the CSS bars these charts replaced on the Overview tab —
 * puts the count in text beside every bar, and its header says why: "the bar is
 * decoration and the table is the data". A charting library loses that by
 * default. Recharts emits `<svg>` with `<path>` elements in it, so a screen
 * reader is handed a graphic with no content, and a coordinator who cannot see
 * the chart is handed nothing at all — on a page whose whole job is telling
 * somebody what has been reported in their village.
 *
 * So the chart is `aria-hidden` and the same numbers are rendered as a real
 * `<table>` in `sr-only`. It costs a few elements, it cannot drift from the
 * chart because both are built from one array, and it is what keeps the
 * promise the component it replaced was making.
 *
 * ## It is a Server Component
 *
 * Deliberately: the frame is markup and the chart inside it is the only part
 * that needs the browser. Putting the empty state and the table here keeps them
 * out of the client bundle and means a period with nothing in it never loads a
 * charting library at all.
 */

export function ChartFrame({
  rows,
  emptyMessage,
  caption,
  valueHeading = "Reports",
  labelHeading = "Period",
  height,
  stackedHeight,
  children,
}: {
  rows: readonly ChartDatum[];
  emptyMessage: string;
  /** What the table is of, read out before it. Never rendered visually. */
  caption: string;
  valueHeading?: string;
  labelHeading?: string;
  /**
   * Fixed, in pixels. Recharts measures its parent, so a container that starts
   * at zero height draws nothing and then jumps — a fixed box is what stops the
   * card reflowing under somebody as it hydrates.
   */
  height: number;
  /**
   * What to reserve below `sm`, for a chart whose parts stack there. Defaults
   * to `height`, which is every chart but the doughnut.
   *
   * **It is reserved rather than allowed**, and the difference is the whole
   * reason this is not simply `min-height`. The charts are loaded lazily, so
   * the box is empty on first paint; a box that merely *permitted* the content
   * to be taller would be the reserved height until the chunk landed and the
   * stacked height afterwards, which is a hundred-pixel jump on the narrowest
   * screen — the exact thing the fixed height exists to prevent, arriving by a
   * different route. Both figures are known before anything renders, so both
   * are stated.
   */
  stackedHeight?: number;
  children: ReactNode;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <>
      {/*
        Two custom properties and a breakpoint, rather than one inline `height`.
        An inline style cannot carry a media query, and the height a stacking
        chart needs is not the height it needs side by side — see
        `severityChartHeight`.
      */}
      <div
        aria-hidden
        className="h-[var(--chart-stacked-height)] sm:h-[var(--chart-height)]"
        style={
          {
            "--chart-height": `${height}px`,
            "--chart-stacked-height": `${stackedHeight ?? height}px`,
          } as CSSProperties
        }
      >
        {children}
      </div>

      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{labelHeading}</th>
            <th scope="col">{valueHeading}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.value ?? "No reports"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
