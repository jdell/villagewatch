import type {
  IncidentStatus,
  IncidentType,
  Severity,
} from "@/generated/prisma/enums";

/**
 * The map's filters — what the filter sheet sets and what the summary
 * pill describes. Pure and client-safe, so the count on the pill, the badge on
 * the filter button and the pins on the map are all one function's answer.
 *
 * The map itself still only ever receives `PUBLIC_INCIDENT_STATUSES` (domain
 * rule 6) — these narrow what the server already sent, in the browser, the way
 * the old period toggle did. Nothing here widens anything.
 */

/** The four periods the map offers, as `TIME_RANGES` presets. */
export const MODERN_MAP_PERIODS = [
  { value: "7", short: "7d", days: 7, phrase: "last 7 days" },
  { value: "30", short: "30d", days: 30, phrase: "last 30 days" },
  { value: "90", short: "90d", days: 90, phrase: "last 90 days" },
  { value: "365", short: "12m", days: 365, phrase: "last 12 months" },
] as const;

export type ModernMapPeriod = (typeof MODERN_MAP_PERIODS)[number]["value"];

export const DEFAULT_MODERN_MAP_PERIOD: ModernMapPeriod = "30";

/**
 * The eight categories the filter sheet shows before "+9 more", in the
 * design's order: the ones a village reports most, first.
 */
export const PRIMARY_MAP_TYPES = [
  "BURGLARY",
  "VEHICLE_CRIME",
  "ANTISOCIAL_BEHAVIOUR",
  "THEFT",
  "VANDALISM",
  "SUSPICIOUS_ACTIVITY",
  "FRAUD_SCAM",
  "ROAD_HAZARD",
] as const satisfies readonly IncidentType[];

export type MapFilters = {
  period: ModernMapPeriod;
  /** Empty means every category. */
  types: readonly IncidentType[];
  /** Empty means every severity. */
  severities: readonly Severity[];
  showResolved: boolean;
  patternsOnly: boolean;
};

export const DEFAULT_MAP_FILTERS: MapFilters = {
  period: DEFAULT_MODERN_MAP_PERIOD,
  types: [],
  severities: [],
  showResolved: true,
  patternsOnly: false,
};

/** The fields `applyMapFilters` reads — a subset of `MapIncident`. */
export type FilterableIncident = {
  type: IncidentType;
  severity: Severity;
  occurredAt: string;
  recurring: boolean;
  status?: IncidentStatus;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function periodDays(period: ModernMapPeriod): number {
  return MODERN_MAP_PERIODS.find((p) => p.value === period)?.days ?? 30;
}

export function periodPhrase(period: ModernMapPeriod): string {
  return MODERN_MAP_PERIODS.find((p) => p.value === period)?.phrase ?? "";
}

/**
 * Everything but the period — what the badge on the filter button counts.
 * The period is always set to something, so counting it would make the badge
 * permanent; the pill states the period in words instead.
 */
export function activeFilterCount(filters: MapFilters): number {
  return (
    filters.types.length +
    filters.severities.length +
    (filters.showResolved ? 0 : 1) +
    (filters.patternsOnly ? 1 : 0)
  );
}

/**
 * The incidents the filters leave, in the order given.
 *
 * `now` is a parameter rather than read here, for the reason `IncidentMap`
 * takes it: the cutoff must not slide under the reader while they look at the
 * map, and a clock read during render is impure.
 */
export function applyMapFilters<T extends FilterableIncident>(
  incidents: readonly T[],
  filters: MapFilters,
  now: number,
): T[] {
  const cutoff = now - periodDays(filters.period) * DAY_MS;

  return incidents.filter((incident) => {
    const at = new Date(incident.occurredAt).getTime();
    if (Number.isNaN(at) || at < cutoff) return false;
    if (filters.types.length && !filters.types.includes(incident.type)) {
      return false;
    }
    if (
      filters.severities.length &&
      !filters.severities.includes(incident.severity)
    ) {
      return false;
    }
    if (!filters.showResolved && incident.status === "RESOLVED") return false;
    if (filters.patternsOnly && !incident.recurring) return false;
    return true;
  });
}

/** "25 reports · last 30 days" — the summary pill's second line. */
export function summaryLine(count: number, period: ModernMapPeriod): string {
  return `${count} ${count === 1 ? "report" : "reports"} · ${periodPhrase(period)}`;
}

/** Adds or removes one value — the chip toggle. */
export function toggleValue<T>(list: readonly T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}
