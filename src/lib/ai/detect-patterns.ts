import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { distanceMeters } from "@/lib/geo";
import {
  INCIDENT_TYPE_LABELS,
  PUBLIC_INCIDENT_STATUSES,
  SEVERITY_LABELS,
} from "@/lib/constants";

/**
 * Cross-referencing a new report against what has already been reported nearby.
 *
 * This module does not talk to Claude. It gathers the historical context and
 * computes a deterministic answer; `structure-incident.ts` hands that context to
 * Claude, which can spot a pattern the counting cannot ("same white van both
 * times"). The deterministic answer is still worth having — it is what the
 * wizard falls back to when the API key is missing or the call fails, and it
 * gives the AI's claim something to be checked against.
 *
 * **Server only.** It reads incidents across the whole village, including ones
 * the current reporter is not entitled to see individually.
 *
 * Two rules the queries here have to respect:
 *
 * 1. **Village-scoped, always.** `villageId` is the tenant boundary and comes
 *    from the session, never from a request body (domain rule 4).
 * 2. **Only `PUBLIC_INCIDENT_STATUSES` are read.** Pending and rejected reports
 *    would make for better early detection, but the pattern note is shown back
 *    to a resident — feeding unreviewed reports in would let a note describe a
 *    report the moderation queue has not cleared yet (domain rule 6).
 */

/** The radius the architecture doc specifies for "same area". */
export const PATTERN_RADIUS_METERS = 200;

/** The window the architecture doc specifies for "recent". */
export const PATTERN_WINDOW_DAYS = 30;

/** Enough context for a pattern without blowing out the prompt. */
const MAX_HISTORY = 12;

export type NearbyIncident = {
  id: string;
  reference: string;
  type: IncidentType;
  severity: Severity;
  title: string;
  description: string;
  locationText: string | null;
  occurredAt: Date;
  distanceMeters: number;
};

export type PatternFinding = {
  recurring: boolean;
  /** Null when nothing stands out — an empty string would read as a failure. */
  patternNote: string | null;
};

type NearbyQuery = {
  villageId: string;
  lat: number;
  lng: number;
  radiusMeters?: number;
  days?: number;
  limit?: number;
};

const PUBLIC_STATUS_STRINGS: string[] = [...PUBLIC_INCIDENT_STATUSES];

/** Metres per degree of latitude. Close enough for a bounding box. */
const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Published incidents within `radiusMeters` of a point in the last `days`,
 * nearest-in-time first.
 *
 * Tries PostGIS first and falls back to a bounding box plus a great-circle
 * filter in JavaScript. The fallback is not defensive padding: `location_point`
 * is populated by a trigger from `prisma/sql/postgis.sql`, which is a manual
 * step after the first migration (see CLAUDE.md). On a database where that has
 * not been run the column is missing or entirely null, and pattern detection
 * would silently return nothing forever rather than obviously breaking. The
 * fallback reads `lat`/`lng`, which are always there.
 */
export async function findNearbyIncidents({
  villageId,
  lat,
  lng,
  radiusMeters = PATTERN_RADIUS_METERS,
  days = PATTERN_WINDOW_DAYS,
  limit = MAX_HISTORY,
}: NearbyQuery): Promise<NearbyIncident[]> {
  if (!process.env.DATABASE_URL) return [];

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    return await queryWithPostgis({
      villageId,
      lat,
      lng,
      radiusMeters,
      since,
      limit,
    });
  } catch (cause) {
    console.warn(
      "PostGIS radius query unavailable, falling back to bounding box",
      cause,
    );

    try {
      return await queryWithBoundingBox({
        villageId,
        lat,
        lng,
        radiusMeters,
        since,
        limit,
      });
    } catch (fallbackCause) {
      // Pattern detection is an enhancement. A report must still be filable
      // when it is unavailable.
      console.error("Nearby incident lookup failed", fallbackCause);
      return [];
    }
  }
}

type ResolvedQuery = {
  villageId: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  since: Date;
  limit: number;
};

/** Shape `$queryRaw` hands back — snake_case, and every enum as text. */
type NearbyRow = {
  id: string;
  reference: string;
  type: string;
  severity: string;
  title: string;
  description: string;
  location_text: string | null;
  occurred_at: Date;
  distance_meters: number;
};

async function queryWithPostgis({
  villageId,
  lat,
  lng,
  radiusMeters,
  since,
  limit,
}: ResolvedQuery): Promise<NearbyIncident[]> {
  // Enums are compared and returned as text so this does not have to build a
  // `incident_status[]` literal — the cast is the only fiddly part of passing
  // an array through a parameter.
  const rows = await prisma.$queryRaw<NearbyRow[]>`
    SELECT
      id::text            AS id,
      reference,
      type::text          AS type,
      severity::text      AS severity,
      title,
      description,
      location_text,
      occurred_at,
      ST_Distance(
        location_point,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
      ) AS distance_meters
    FROM incidents
    WHERE village_id = ${villageId}::uuid
      AND status::text = ANY (${PUBLIC_STATUS_STRINGS}::text[])
      AND occurred_at >= ${since}
      AND location_point IS NOT NULL
      AND ST_DWithin(
            location_point,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${radiusMeters}
          )
    ORDER BY occurred_at DESC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    type: row.type as IncidentType,
    severity: row.severity as Severity,
    title: row.title,
    description: row.description,
    locationText: row.location_text,
    occurredAt: new Date(row.occurred_at),
    distanceMeters: Math.round(Number(row.distance_meters)),
  }));
}

async function queryWithBoundingBox({
  villageId,
  lat,
  lng,
  radiusMeters,
  since,
  limit,
}: ResolvedQuery): Promise<NearbyIncident[]> {
  const deltaLat = radiusMeters / METERS_PER_DEGREE_LAT;
  const deltaLng =
    radiusMeters /
    (METERS_PER_DEGREE_LAT * Math.max(Math.cos((lat * Math.PI) / 180), 0.01));

  const rows = await prisma.incident.findMany({
    where: {
      villageId,
      status: { in: [...PUBLIC_INCIDENT_STATUSES] },
      occurredAt: { gte: since },
      lat: { gte: lat - deltaLat, lte: lat + deltaLat },
      lng: { gte: lng - deltaLng, lte: lng + deltaLng },
    },
    select: {
      id: true,
      reference: true,
      type: true,
      severity: true,
      title: true,
      // `description` is the anonymised public column. `rawDescription` must
      // never be read here — it is not needed and reading it would owe an
      // AuditLog row (domain rule 1).
      description: true,
      locationText: true,
      occurredAt: true,
      lat: true,
      lng: true,
    },
    orderBy: { occurredAt: "desc" },
    // The box is a square around the circle, so it over-selects by ~27%.
    // Fetching extra rows means the circle filter below can still fill `limit`.
    take: limit * 2,
  });

  return rows
    .flatMap((row) => {
      if (row.lat === null || row.lng === null) return [];

      const distance = distanceMeters(
        { lat, lng },
        { lat: row.lat, lng: row.lng },
      );

      if (distance > radiusMeters) return [];

      return [
        {
          id: row.id,
          reference: row.reference,
          type: row.type,
          severity: row.severity,
          title: row.title,
          description: row.description,
          locationText: row.locationText,
          occurredAt: row.occurredAt,
          distanceMeters: Math.round(distance),
        },
      ];
    })
    .slice(0, limit);
}

/**
 * The historical context, as lines Claude can read.
 *
 * Deliberately terse and already anonymised — every field here comes from a
 * published incident, so it has been through this same pass and a coordinator.
 */
export function formatHistoryForPrompt(
  incidents: readonly NearbyIncident[],
  now: Date = new Date(),
): string {
  if (incidents.length === 0) {
    return "No incidents have been reported in this area in the last 30 days.";
  }

  return incidents
    .map((incident) => {
      const days = Math.max(
        0,
        Math.round(
          (now.getTime() - incident.occurredAt.getTime()) /
            (24 * 60 * 60 * 1000),
        ),
      );

      const when =
        days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;

      return [
        `- ${when}, ${incident.distanceMeters}m away`,
        `${INCIDENT_TYPE_LABELS[incident.type]} (${SEVERITY_LABELS[incident.severity]})`,
        incident.title,
        incident.locationText ?? "no landmark given",
      ].join(" | ");
    })
    .join("\n");
}

/**
 * The deterministic reading of the same history.
 *
 * Thresholds are chosen so a note is worth reading rather than constant: two
 * previous reports of the same kind is a repeat, four of any kind is a hotspot.
 * One previous incident is a coincidence, and saying so every time would train
 * residents to ignore the line.
 */
export function detectPatternHeuristic(
  incidents: readonly NearbyIncident[],
  type: IncidentType,
  radiusMeters: number = PATTERN_RADIUS_METERS,
): PatternFinding {
  if (incidents.length === 0) return { recurring: false, patternNote: null };

  const sameType = incidents.filter((incident) => incident.type === type);
  const area = `within ${radiusMeters}m`;
  const label = INCIDENT_TYPE_LABELS[type].toLowerCase();

  if (sameType.length >= 2) {
    const total = sameType.length + 1;
    return {
      recurring: true,
      patternNote: `${ordinal(total)} report of ${label} ${area} in the last ${PATTERN_WINDOW_DAYS} days.`,
    };
  }

  if (incidents.length >= 4) {
    return {
      recurring: true,
      patternNote: `${incidents.length} incidents have been reported ${area} in the last ${PATTERN_WINDOW_DAYS} days.`,
    };
  }

  return { recurring: false, patternNote: null };
}

function ordinal(value: number): string {
  const remainderTen = value % 10;
  const remainderHundred = value % 100;

  if (remainderTen === 1 && remainderHundred !== 11) return `${value}st`;
  if (remainderTen === 2 && remainderHundred !== 12) return `${value}nd`;
  if (remainderTen === 3 && remainderHundred !== 13) return `${value}rd`;

  return `${value}th`;
}
