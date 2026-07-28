import type { Severity } from "@/generated/prisma/enums";

/**
 * Incident density as heat: where trouble clusters, rather than where each
 * report was filed.
 *
 * **Client-safe.** Types only from Prisma and nothing else, because this runs
 * inside the Leaflet layer in the browser. The pins and the heat are computed
 * from the same array the map already holds, so the toggle costs no round trip.
 *
 * ## What the intensity means
 *
 * `severity weight × recency decay`, both in 0..1, so one point is at most 1.0.
 * The two factors answer different questions and multiplying them is what makes
 * the map read correctly: a critical report from two years ago should not glow
 * as hard as a critical report from this morning, and neither should a wildlife
 * sighting from this morning glow as hard as a burglary.
 *
 * `leaflet.heat` sums the intensities that fall in a cell and clamps the total
 * at `max` (1 by default, which is what this scale is built for). So the red end
 * of the gradient is not "one critical incident" — it is *accumulation*: a
 * handful of recent moderate reports on the same corner reach it too. That is
 * the property a coordinator is looking for, and it is why the severity weights
 * are compressed towards the top (0.8 → 1.0) rather than linear: the difference
 * between HIGH and CRITICAL matters far less on a density map than the
 * difference between one report and five.
 *
 * ## What it is not
 *
 * Not a pattern detector. `src/lib/ai/detect-patterns.ts` does that against the
 * database with `ST_DWithin` and a 200m/30d window, and its output is what
 * `recurring` and `patternNote` carry. This is a visual aid over whatever the
 * viewer is already allowed to see.
 *
 * Every coordinate feeding it was jittered by `LOCATION_FUZZ_METERS` on the way
 * into the database (domain rule 2), which is worth remembering when reading the
 * radius below: at `radius: 50` the blob is comfortably wider than the fuzz, so
 * the heat says "around here" — which is all the underlying data can support.
 */

/**
 * Severity → weight, 0..1.
 *
 * The schema's second level is `MEDIUM` (the architecture document calls it
 * MODERATE — see the note above `SEVERITIES` in `constants.ts`); the weight is
 * the same 0.6 either way.
 */
export const HEAT_SEVERITY_WEIGHT = {
  LOW: 0.3,
  MEDIUM: 0.6,
  HIGH: 0.8,
  CRITICAL: 1.0,
} as const satisfies Record<Severity, number>;

/**
 * Age in days → weight, interpolated between these anchors.
 *
 * Piecewise linear rather than an exponential: the anchors are the figures the
 * brief asked for and a curve fitted through them would be an invention that
 * happened to pass through four points. Anything older than the last anchor sits
 * at its floor — a report from three years ago still says something about a
 * place, and dropping it to zero would quietly turn "all time" into "last month".
 */
const RECENCY_ANCHORS = [
  { days: 0, weight: 1.0 },
  { days: 7, weight: 0.7 },
  { days: 30, weight: 0.3 },
] as const;

/** Where the decay bottoms out, for anything past the last anchor. */
const RECENCY_FLOOR = 0.1;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How much an incident of this age still counts, 0..1.
 *
 * A future `occurredAt` is treated as today rather than clamped to zero: a
 * reporter whose phone clock is a day out, or who typed tomorrow's date, has
 * filed a report about now.
 */
export function recencyWeight(occurredAt: Date | string | number, now: number): number {
  const at = new Date(occurredAt).getTime();

  // An unparseable date is not a reason to drop a report off the map. Treat it
  // as old, which is the answer that overstates nothing.
  if (Number.isNaN(at)) return RECENCY_FLOOR;

  const days = Math.max(0, (now - at) / DAY_MS);

  // Strictly past the last anchor, not at it: 30 days old is the anchor's own
  // 0.3, and the floor is for what comes after. An inclusive test here would
  // drop a report a third of the way down the scale the moment it crossed a
  // boundary it was meant to land on.
  const last = RECENCY_ANCHORS[RECENCY_ANCHORS.length - 1];
  if (days > last.days) return RECENCY_FLOOR;

  for (let index = 1; index < RECENCY_ANCHORS.length; index += 1) {
    const from = RECENCY_ANCHORS[index - 1];
    const to = RECENCY_ANCHORS[index];
    if (days > to.days) continue;

    const span = to.days - from.days;
    const progress = span === 0 ? 0 : (days - from.days) / span;
    return from.weight + (to.weight - from.weight) * progress;
  }

  return RECENCY_FLOOR;
}

/** `[lat, lng, intensity]`, the tuple `leaflet.heat` reads. */
export type HeatPoint = [number, number, number];

type HeatSource = {
  severity: Severity;
  occurredAt: Date | string | number;
  lat: number;
  lng: number;
};

/**
 * Incidents → heat points.
 *
 * `now` is passed in rather than read here for the same reason `IncidentMap`
 * takes it: `Date.now()` during a render is impure, the React Compiler rejects
 * it, and a cutoff that slid between the pins and the heat would draw two
 * different maps of the same data.
 */
export function toHeatPoints(
  incidents: readonly HeatSource[],
  now: number,
): HeatPoint[] {
  return incidents.map((incident) => [
    incident.lat,
    incident.lng,
    HEAT_SEVERITY_WEIGHT[incident.severity] * recencyWeight(incident.occurredAt, now),
  ]);
}

/**
 * The layer's own configuration.
 *
 * `radius` and `blur` are screen pixels, not metres — `leaflet.heat` draws in
 * container space, so a blob is the same size at every zoom. `maxZoom` is where
 * a point reaches full intensity: below it the plugin scales intensity down, so
 * zooming out merges neighbouring reports into one hotter blob rather than
 * peppering the parish with faint dots.
 */
export const HEATMAP_CONFIG = {
  radius: 50,
  blur: 30,
  maxZoom: 17,
  /**
   * The intensity a cell has to reach for the top of the gradient. Stated rather
   * than left to the plugin's identical default, because the whole severity ×
   * recency scale is built to put one point at 1.0 at most — so red means
   * *accumulation*, and a change here silently rescales the map.
   */
  max: 1,
  /**
   * Green → yellow → orange → red. No stop below the first, so the coolest heat
   * a single low-severity report can produce still reads as green rather than
   * fading through a colour nobody chose.
   */
  gradient: {
    0.3: "green",
    0.5: "yellow",
    0.7: "orange",
    1.0: "red",
  },
} as const;

/**
 * The gradient as a CSS value, for the legend beside the map.
 *
 * **Sorted, and that is not decoration.** `1.0` is an integer-like key, so
 * JavaScript orders it *first* — `Object.keys` on the gradient above yields
 * `["1", "0.3", "0.5", "0.7"]`. Canvas does not care, because `addColorStop`
 * sorts by offset; CSS very much does, because a `linear-gradient` stop below
 * the one before it is clamped up to it. Unsorted, this produced `red 100%,
 * green 30%…`, which renders as a solid red bar under a map whose whole point
 * is that red is rare.
 */
export const HEATMAP_LEGEND_CSS = `linear-gradient(to right, ${Object.entries(
  HEATMAP_CONFIG.gradient,
)
  .map(([stop, colour]) => ({ stop: Number(stop), colour }))
  .sort((a, b) => a.stop - b.stop)
  .map(({ stop, colour }) => `${colour} ${stop * 100}%`)
  .join(", ")})`;
