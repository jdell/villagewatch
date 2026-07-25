import type { Metadata } from "next";
import { MapView } from "@/components/map-view";
import { NoVillage } from "@/components/no-village";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MAP_DEFAULTS, PUBLIC_INCIDENT_STATUSES } from "@/lib/constants";
import {
  MAX_MAP_INCIDENTS,
  PUBLIC_INCIDENT_SELECT,
  toMapIncident,
} from "@/lib/incidents";

export const metadata: Metadata = { title: "Map" };

/**
 * The village map.
 *
 * A Server Component that does the querying and hands a flat array to
 * `MapView`, which owns the Leaflet import — `ssr: false` is only legal from a
 * Client Component, and Leaflet touches `window` the moment it is imported.
 *
 * Two constraints on the query, both load-bearing:
 *
 *   - Scoped by `villageId` from the session. The village is the tenant
 *     boundary (domain rule 4).
 *   - Filtered to `PUBLIC_INCIDENT_STATUSES`. Drafts, reports awaiting review
 *     and rejected ones stay in the moderation queue and never reach a
 *     resident's map (domain rule 6).
 *
 * The whole set is sent at once and the date-range toggle filters it in the
 * browser. At a village's volume that is a few tens of kilobytes and makes the
 * toggle instant; a village that outgrows `MAX_MAP_INCIDENTS` wants clustering,
 * not pagination.
 */
export default async function MapPage() {
  const session = await requireSession("/map");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  const [village, rows] = await Promise.all([
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
  ]);

  if (!village) return <NoVillage />;

  const incidents = rows
    .map(toMapIncident)
    .filter((incident): incident is NonNullable<typeof incident> =>
      Boolean(incident),
    );

  return (
    <MapView
      incidents={incidents}
      center={{ lat: village.centerLat, lng: village.centerLng }}
      zoom={village.defaultZoom || MAP_DEFAULTS.zoom}
      villageName={village.name}
    />
  );
}
