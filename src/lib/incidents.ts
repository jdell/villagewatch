import type { MapIncident } from "@/components/incident-map";

/**
 * Shared shape for reading incidents out of the database.
 *
 * The point of the select being a named constant rather than written out at
 * each call site is that `rawDescription` is absent from it. Every list, map
 * and detail query goes through this, so no reader can pick up the reporter's
 * verbatim words by accident — reading that column is a deliberate act that
 * owes an `AuditLog` row (domain rule 1), and it does not belong on a page that
 * renders to residents.
 */
export const PUBLIC_INCIDENT_SELECT = {
  id: true,
  reference: true,
  type: true,
  severity: true,
  status: true,
  title: true,
  /** The anonymised public column. */
  description: true,
  occurredAt: true,
  reportedAt: true,
  locationText: true,
  lat: true,
  lng: true,
  recurring: true,
  patternNote: true,
  peopleCount: true,
  anonymized: true,
  aiModel: true,
} as const;

/**
 * Ceiling on how many pins one map request will draw.
 *
 * Leaflet renders a few hundred markers without complaint, and a village that
 * has produced more than this in its history has a clustering problem rather
 * than a paging one. Newest first, so what falls off the end is the oldest.
 */
export const MAX_MAP_INCIDENTS = 500;

/** How many rows one page of the incident list holds. */
export const INCIDENT_PAGE_SIZE = 30;

type IncidentRow = {
  id: string;
  reference: string;
  type: MapIncident["type"];
  severity: MapIncident["severity"];
  title: string;
  description: string;
  occurredAt: Date;
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  recurring: boolean;
};

/**
 * Database row → map pin.
 *
 * Returns null for a row with no coordinates: a report can be filed with the
 * location skipped, and it belongs in the list without inventing a pin for it.
 * `occurredAt` becomes an ISO string on the way across, because the map is a
 * Client Component and a flat string is one less thing to serialise.
 */
export function toMapIncident(row: IncidentRow): MapIncident | null {
  if (row.lat === null || row.lng === null) return null;

  return {
    id: row.id,
    reference: row.reference,
    type: row.type,
    severity: row.severity,
    title: row.title,
    description: row.description,
    occurredAt: row.occurredAt.toISOString(),
    locationText: row.locationText,
    lat: row.lat,
    lng: row.lng,
    recurring: row.recurring,
  };
}
