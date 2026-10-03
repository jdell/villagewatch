import type { IncidentType } from "@/generated/prisma/enums";

/**
 * The reports that make up a pattern, as the map's incident sheet shows
 * them — "Part of a pattern" and its Show button.
 *
 * The map is told only that a report is `recurring`, not which others it
 * recurs with: that judgement was made by the AI pass and the 200m / 30-day
 * count in `src/lib/ai/detect-patterns.ts` when it was filed, and nothing
 * stores the membership. So Show applies the same rule over what is on the
 * map: the recurring reports of the same category within the detector's radius
 * and window of the one selected. Client-safe and pure.
 *
 * The two numbers repeat `PATTERN_RADIUS_METERS` and `PATTERN_WINDOW_DAYS`,
 * which cannot be imported here — that module reads the database — and
 * `tests/incident-sheet.test.ts` asserts they agree.
 */

export const MAP_PATTERN_RADIUS_METERS = 200;
export const MAP_PATTERN_WINDOW_DAYS = 30;

type Located = {
  id: string;
  type: IncidentType;
  occurredAt: string;
  lat: number;
  lng: number;
  recurring: boolean;
};

/** Great-circle distance in metres — haversine, ample at village scale. */
export function metresBetween(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** The selected report and the recurring ones it plausibly belongs with. */
export function patternMembers<T extends Located>(
  selected: T,
  incidents: readonly T[],
): T[] {
  const at = new Date(selected.occurredAt).getTime();
  const windowMs = MAP_PATTERN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const others = incidents.filter(
    (other) =>
      other.id !== selected.id &&
      other.recurring &&
      other.type === selected.type &&
      Math.abs(new Date(other.occurredAt).getTime() - at) <= windowMs &&
      metresBetween(selected, other) <= MAP_PATTERN_RADIUS_METERS,
  );

  return [selected, ...others];
}
