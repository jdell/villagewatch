import type { IncidentType } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { distanceMeters } from "@/lib/geo";
import { PATTERN_RADIUS_METERS } from "@/lib/ai/detect-patterns";
import { PUBLIC_INCIDENT_STATUSES } from "@/lib/constants";

/**
 * How busy this corner of the village normally is, and whether this kind of
 * report is on the way up.
 *
 * The two factors `detect-patterns.ts` does not answer. That module asks "is
 * this one of a cluster?" over a 30-day window; this one asks "is a cluster
 * unusual *here*?" and "is this category unusual *now*?", which are the
 * questions that separate a third car break-in on a street that has one a year
 * from a third on a street that has three a month. Both go into the same Claude
 * call — see `structure-incident.ts` — and neither decides anything on its own.
 *
 * **Server only.** It reads incidents across the whole village, including ones
 * the reporter is not entitled to see individually, and the same two rules
 * `detect-patterns.ts` states apply here for the same reasons:
 *
 * 1. **Village-scoped, always.** `villageId` comes from the session, never from
 *    a request body (domain rule 4).
 * 2. **Only `PUBLIC_INCIDENT_STATUSES`.** A baseline computed over the
 *    moderation queue would let a rationale shown to a resident describe
 *    reports the queue has not cleared (domain rule 6). It also makes the
 *    figure unstable: a report that is later rejected would have moved it.
 *
 * ## `insufficientHistory` is the load-bearing field
 *
 * A village three weeks old has no baseline. "This street is normally quiet" is
 * a claim, and computed over eleven reports it is a claim the data does not
 * support — it would be true of every street in every village on its first
 * month. When this is true the caller omits the whole block from the prompt
 * rather than sending a small number, which is the rule `police-data.ts`
 * follows for a month nobody fetched: a figure that cannot be trusted is worse
 * than no figure, because arithmetic that is individually correct reads as
 * authoritative.
 */

/** A village younger than this has no baseline worth quoting. */
export const MIN_VILLAGE_AGE_DAYS = 90;

/** How far back the "normally" in "normally quiet" reaches. */
export const BASELINE_MONTHS = 12;

/** The recent window the baseline is compared against. */
export const TREND_RECENT_DAYS = 30;

/** The window before it, which the recent rate is measured against. */
export const TREND_PRIOR_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

export type SeverityContext = {
  /**
   * Reports within `PATTERN_RADIUS_METERS` over the last `BASELINE_MONTHS`,
   * expressed per 30 days so it is directly comparable with the figure below.
   * Rounded to one decimal — a baseline quoted to four is a precision the
   * underlying jitter does not support (domain rule 2).
   */
  areaBaselinePerMonth: number;
  /** Same radius, last 30 days. The thing the baseline is there to judge. */
  areaLast30Days: number;
  /**
   * This category village-wide: the last 30 days against the 90 before it,
   * with the prior expressed at the same 30-day rate. Null where the category
   * has no history at all, because a rise from nothing is not a trend.
   */
  categoryTrend: {
    type: IncidentType;
    recent: number;
    priorRate: number;
  } | null;
  /** True where the village is too young for any of the above to mean anything. */
  insufficientHistory: boolean;
};

type SeverityContextQuery = {
  villageId: string;
  /** The report's own coordinates. Null skips the area half. */
  lat?: number | null;
  lng?: number | null;
  type?: IncidentType;
  /** Injected in tests; defaults to now. */
  now?: Date;
};

/**
 * The context for one report, or null where there is none to be had.
 *
 * Null covers no database and a failed query alike, and the caller omits the
 * block from the prompt either way. **It never throws**: this runs inside
 * `POST /api/incidents/process`, whose whole contract is that every failure is
 * an ordinary state the wizard recovers from — a reporter must never be unable
 * to file because a baseline could not be computed.
 */
export async function getSeverityContext(
  query: SeverityContextQuery,
): Promise<SeverityContext | null> {
  if (!process.env.DATABASE_URL) return null;

  const now = query.now ?? new Date();

  try {
    const village = await prisma.village.findUnique({
      where: { id: query.villageId },
      select: { createdAt: true },
    });

    if (!village) return null;

    const ageDays = (now.getTime() - village.createdAt.getTime()) / DAY_MS;

    if (ageDays < MIN_VILLAGE_AGE_DAYS) {
      /**
       * Returned rather than null, and the difference matters: null means the
       * lookup failed, this means it succeeded and the honest answer is "not
       * long enough to say". The caller renders neither, but a future one that
       * wanted to explain the absence can tell them apart.
       */
      return {
        areaBaselinePerMonth: 0,
        areaLast30Days: 0,
        categoryTrend: null,
        insufficientHistory: true,
      };
    }

    const [area, categoryTrend] = await Promise.all([
      areaCounts(query, now),
      categoryCounts(query, now),
    ]);

    return { ...area, categoryTrend, insufficientHistory: false };
  } catch (error) {
    console.error("[severity-context] lookup failed", error);
    return null;
  }
}

/**
 * The radius half, filtered in JavaScript rather than in PostGIS.
 *
 * `findNearbyIncidents` reaches for `ST_DWithin` and falls back to a bounding
 * box; this does neither, because it needs a **count over twelve months**
 * rather than the dozen most recent rows, and the shape that suits is one
 * indexed read of two float columns. `@@index([villageId, status, occurredAt])`
 * covers the predicate, the rows carry no text, and a parish's twelve months is
 * a few hundred of them — `MAX_MAP_INCIDENTS` is 500 for a village's entire
 * history.
 *
 * Reports with no coordinates are excluded rather than counted at distance
 * zero. A report filed without a location is not evidence about this street.
 */
async function areaCounts(
  query: SeverityContextQuery,
  now: Date,
): Promise<{ areaBaselinePerMonth: number; areaLast30Days: number }> {
  const { lat, lng } = query;

  if (typeof lat !== "number" || typeof lng !== "number") {
    return { areaBaselinePerMonth: 0, areaLast30Days: 0 };
  }

  const baselineSince = new Date(
    now.getTime() - BASELINE_MONTHS * 30 * DAY_MS,
  );
  const recentSince = new Date(now.getTime() - TREND_RECENT_DAYS * DAY_MS);

  const rows = await prisma.incident.findMany({
    where: {
      villageId: query.villageId,
      status: { in: [...PUBLIC_INCIDENT_STATUSES] },
      occurredAt: { gte: baselineSince },
      lat: { not: null },
      lng: { not: null },
    },
    select: { lat: true, lng: true, occurredAt: true },
  });

  let within = 0;
  let recent = 0;

  for (const row of rows) {
    if (row.lat === null || row.lng === null) continue;

    if (distanceMeters({ lat, lng }, { lat: row.lat, lng: row.lng }) > PATTERN_RADIUS_METERS) {
      continue;
    }

    within += 1;
    if (row.occurredAt >= recentSince) recent += 1;
  }

  const months = BASELINE_MONTHS;

  return {
    // One decimal. The coordinates were jittered by `LOCATION_FUZZ_METERS` on
    // the way in, so a baseline quoted more precisely than this claims an
    // accuracy the underlying data does not have.
    areaBaselinePerMonth: Math.round((within / months) * 10) / 10,
    areaLast30Days: recent,
  };
}

/**
 * The category half — village-wide, and deliberately not radius-filtered.
 *
 * "Vehicle crime is up across the village" is a different and more useful
 * statement than "up on this street", where the counts are small enough that
 * two reports look like a doubling. Two `count`s on
 * `@@index([villageId, type])` rather than a scan.
 */
async function categoryCounts(
  query: SeverityContextQuery,
  now: Date,
): Promise<SeverityContext["categoryTrend"]> {
  const { type } = query;
  if (!type) return null;

  const recentSince = new Date(now.getTime() - TREND_RECENT_DAYS * DAY_MS);
  const priorSince = new Date(
    now.getTime() - (TREND_RECENT_DAYS + TREND_PRIOR_DAYS) * DAY_MS,
  );

  const [recent, prior] = await Promise.all([
    prisma.incident.count({
      where: {
        villageId: query.villageId,
        type,
        status: { in: [...PUBLIC_INCIDENT_STATUSES] },
        occurredAt: { gte: recentSince },
      },
    }),
    prisma.incident.count({
      where: {
        villageId: query.villageId,
        type,
        status: { in: [...PUBLIC_INCIDENT_STATUSES] },
        occurredAt: { gte: priorSince, lt: recentSince },
      },
    }),
  ]);

  // A rise from nothing is not a trend — it is the first report of its kind,
  // and saying "up 300%" about it would be arithmetic in place of meaning.
  if (prior === 0) return null;

  return {
    type,
    recent,
    // The prior window expressed at the same 30-day rate, so the two numbers in
    // the prompt are comparable without the model doing the division.
    priorRate: Math.round((prior / (TREND_PRIOR_DAYS / TREND_RECENT_DAYS)) * 10) / 10,
  };
}

/**
 * The block that goes into the prompt, or an empty string.
 *
 * Empty for a young village and empty for a failed lookup, which is the whole
 * point: the model is given the figures or it is given nothing, and it is never
 * given a baseline of `0.0` that it might reasonably read as "this street has
 * never had anything happen on it".
 */
export function formatSeverityContextForPrompt(
  context: SeverityContext | null,
): string {
  if (!context || context.insufficientHistory) return "";

  const lines = [
    `Reports within ${PATTERN_RADIUS_METERS}m, normal rate: ${context.areaBaselinePerMonth} per 30 days (averaged over the last ${BASELINE_MONTHS} months)`,
    `Reports within ${PATTERN_RADIUS_METERS}m, last ${TREND_RECENT_DAYS} days: ${context.areaLast30Days}`,
  ];

  if (context.categoryTrend) {
    lines.push(
      `This category village-wide: ${context.categoryTrend.recent} in the last ${TREND_RECENT_DAYS} days, against ${context.categoryTrend.priorRate} per ${TREND_RECENT_DAYS} days over the ${TREND_PRIOR_DAYS} days before that`,
    );
  }

  return ["<area_context>", ...lines, "</area_context>"].join("\n");
}
