"use client";

/**
 * The four charts behind one module specifier.
 *
 * **This barrel is load-bearing and is not tidiness.** `lazy-charts.tsx` defers
 * each chart with its own `next/dynamic` call, and a `dynamic()` boundary
 * creates an async chunk per *import specifier*. Pointed at four different
 * files, the bundler cannot see that all four need Recharts and emits it into
 * each one — measured, not assumed: four copies at 340 KB, and a static import
 * of the lot came to 420 KB in one shared chunk. Deferring made the download
 * larger than not deferring.
 *
 * With every `dynamic()` importing *this* file there is one boundary, one
 * chunk, and one copy of the library, fetched when the first chart mounts.
 *
 * So: add a chart here as well as beside it, and never point a `dynamic()` at
 * one of the individual files. The failure is silent — the page works, the
 * charts draw, and the phone downloads the library again.
 */

export { ActivitySparkline } from "@/components/charts/activity-sparkline";
export { IncidentTrendChart } from "@/components/charts/incident-trend-chart";
export { HorizontalBarChart } from "@/components/charts/horizontal-bar-chart";
export { SeverityDonut } from "@/components/charts/severity-donut";
