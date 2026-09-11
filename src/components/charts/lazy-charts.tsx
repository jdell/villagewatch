"use client";

import dynamic from "next/dynamic";

/**
 * This file exists to own the four `next/dynamic` calls, which are only legal
 * from a Client Component — the same reason `map-view.tsx` and
 * `hotspot-heatmap.tsx` each own theirs.
 *
 * ## Why the charts are deferred at all
 *
 * Recharts is about 420 KB before compression and it is the single largest
 * thing the Overview tab would otherwise download. Imported directly it lands
 * in the route's own bundle, so a coordinator opening the dashboard on a phone
 * in a village pays for it before the first figure appears — on a page whose
 * text and numbers are all rendered on the server and need no JavaScript at all
 * to be read.
 *
 * Deferred, the page arrives, `ChartFrame` has already reserved the height, and
 * the pictures fill in. **Nothing is lost by having them arrive late**, which is
 * what makes this safe rather than a trade: `ResponsiveContainer` measures its
 * parent, so a chart has no meaningful server rendering to give up, and the
 * numbers themselves are in the table `ChartFrame` renders — which is real
 * markup, present on first paint, and is what a screen reader was always going
 * to read instead of the picture.
 *
 * ## One file rather than four
 *
 * `map-view.tsx` and `hotspot-heatmap.tsx` are two wrappers around one
 * component because they differ in what they pass it and what they draw while
 * it loads. These four differ in neither: the reason to defer is identical, the
 * skeleton is identical, and four files repeating it would be four places for
 * the reason to go stale.
 */

/**
 * What stands in while the chunk arrives.
 *
 * Fills the box `ChartFrame` has already sized, so nothing on the page moves
 * when the chart lands — the layout shift is the thing a deferred chart would
 * otherwise cost, and it is the one a reader actually notices.
 */
function ChartSkeleton() {
  return <div className="size-full animate-pulse rounded-xl bg-slate-100" />;
}

/*
  The options object is written out at each call and cannot be hoisted into a
  constant: `next/dynamic` is read by the compiler rather than at run time, and
  it rejects anything but an object literal —
  https://nextjs.org/docs/messages/invalid-dynamic-options-type. `tsc` is
  perfectly happy with the shared constant, so this fails in `npm run build`
  and nowhere earlier.
*/
export const IncidentTrendChart = dynamic(
  () => import("@/components/charts/charts").then((m) => m.IncidentTrendChart),
  { ssr: false, loading: ChartSkeleton },
);

export const HorizontalBarChart = dynamic(
  () => import("@/components/charts/charts").then((m) => m.HorizontalBarChart),
  { ssr: false, loading: ChartSkeleton },
);

export const SeverityDonut = dynamic(
  () => import("@/components/charts/charts").then((m) => m.SeverityDonut),
  { ssr: false, loading: ChartSkeleton },
);

export const ActivitySparkline = dynamic(
  () => import("@/components/charts/charts").then((m) => m.ActivitySparkline),
  { ssr: false, loading: ChartSkeleton },
);
