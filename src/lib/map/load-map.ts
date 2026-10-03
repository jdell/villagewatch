import type { MapEvent, MapIncident } from "@/components/incident-map";
import type { MapScreenProps } from "@/components/modern/map-screen";
import type { ReportGate } from "@/components/modern/report-flow";
import type { Session } from "@/lib/auth";
import {
  COMPLIANCE_BLOCKED_MESSAGE,
  getVillageCompliance,
} from "@/lib/compliance";
import {
  MAP_DEFAULTS,
  PUBLIC_INCIDENT_STATUSES,
  isCoordinatorRole,
} from "@/lib/constants";
import { getVillageEventsEnabled, listMapEvents } from "@/lib/events";
import {
  MAX_MAP_INCIDENTS,
  PUBLIC_INCIDENT_SELECT,
  toMapIncident,
} from "@/lib/incidents";
import { prisma } from "@/lib/prisma";
import {
  getVillagePrivacyLevel,
  getVillageServiceState,
} from "@/lib/villages";

/**
 * What a map screen needs, read once — shared by `/map` and, on a phone, by
 * `/incidents` and `/trends`, which render the same map with their sheet open.
 * Server only.
 *
 * Two constraints on the incident query, both load-bearing:
 *
 *   - Scoped by `villageId` from the session. The village is the tenant
 *     boundary (domain rule 4).
 *   - Filtered to `PUBLIC_INCIDENT_STATUSES`. Drafts, reports awaiting review
 *     and rejected ones stay in the moderation queue and never reach a
 *     resident's map (domain rule 6) — the one exception being the viewer's own
 *     pending reports, below.
 */

export type VillageMap = {
  incidents: MapIncident[];
  center: { lat: number; lng: number };
  zoom: number;
  villageName: string;
  /** Upcoming events with a pin, or null when the village has events off. */
  events: MapEvent[] | null;
};

export async function loadVillageMap(
  villageId: string,
): Promise<VillageMap | null> {
  const [village, rows, eventsEnabled] = await Promise.all([
    prisma.village.findUnique({
      where: { id: villageId },
      select: {
        name: true,
        centerLat: true,
        centerLng: true,
        defaultZoom: true,
      },
    }),
    prisma.incident.findMany({
      where: {
        villageId,
        status: { in: [...PUBLIC_INCIDENT_STATUSES] },
        lat: { not: null },
        lng: { not: null },
      },
      select: PUBLIC_INCIDENT_SELECT,
      orderBy: { occurredAt: "desc" },
      take: MAX_MAP_INCIDENTS,
    }),
    getVillageEventsEnabled(villageId),
  ]);

  if (!village) return null;

  /*
    Null rather than an empty list when events are off, so the map can tell
    "nothing coming up" (the toggle stays) from "not a feature here" (no toggle
    at all). Both reads degrade to empty rather than throwing.
  */
  const events: MapEvent[] | null = eventsEnabled
    ? (await listMapEvents(villageId, new Date())).flatMap((event) =>
        event.lat !== null && event.lng !== null
          ? [
              {
                id: event.id,
                title: event.title,
                category: event.category,
                locationText: event.locationText,
                startsAt: event.startsAt,
                endsAt: event.endsAt,
                lat: event.lat,
                lng: event.lng,
              },
            ]
          : [],
      )
    : null;

  return {
    incidents: rows.flatMap((row) => {
      const incident = toMapIncident(row);
      return incident ? [incident] : [];
    }),
    center: { lat: village.centerLat, lng: village.centerLng },
    zoom: village.defaultZoom || MAP_DEFAULTS.zoom,
    villageName: village.name,
    events,
  };
}

/**
 * Everything the map screen adds to `loadVillageMap`.
 *
 * - **The viewer's own pending reports**, drawn dashed — "yours, in review".
 *   Keyed on `reporterId` from the session, so nobody sees another resident's
 *   queue, coordinators included; it is the visibility the incident page
 *   already gives a reporter, and domain rule 6 is unchanged.
 * - **The report gate**: the service state, then the compliance gate — the
 *   order and the words `/incidents/new` uses — so the report sheet refuses
 *   before anybody describes anything. `POST /api/incidents` refuses anyway.
 * - **The privacy level** the photo uploader applies on the device.
 */
export async function loadMapExtras(
  session: Session,
  villageId: string,
  villageName: string,
): Promise<
  Pick<MapScreenProps, "reportGate" | "privacyLevel" | "canPostAlert"> & {
    ownPending: MapIncident[];
  }
> {
  const canPostAlert = isCoordinatorRole(session.profile?.role);

  const [pendingRows, service, compliance, privacyLevel] = await Promise.all([
    prisma.incident.findMany({
      where: {
        villageId,
        reporterId: session.user.id,
        status: "PENDING_REVIEW",
        lat: { not: null },
        lng: { not: null },
      },
      select: PUBLIC_INCIDENT_SELECT,
      orderBy: { occurredAt: "desc" },
      take: 20,
    }),
    getVillageServiceState(villageId),
    getVillageCompliance(villageId),
    getVillagePrivacyLevel(villageId),
  ]);

  const reportGate: ReportGate = !service.inService
    ? {
        ok: false,
        title: `${villageName} is not taking reports`,
        message: service.message,
      }
    : !compliance.complete
      ? {
          ok: false,
          title: "Reporting is not open yet",
          message: COMPLIANCE_BLOCKED_MESSAGE,
          ...(canPostAlert
            ? {
                fix: {
                  href: "/dashboard/compliance",
                  label: "Complete compliance setup",
                },
              }
            : {}),
        }
      : { ok: true };

  return {
    ownPending: pendingRows.flatMap((row) => {
      const incident = toMapIncident(row);
      return incident ? [{ ...incident, pending: true }] : [];
    }),
    reportGate,
    privacyLevel: privacyLevel.value,
    canPostAlert,
  };
}
