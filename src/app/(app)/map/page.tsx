import type { Metadata } from "next";
import { MapScreen } from "@/components/modern/map-screen";
import { NoVillage } from "@/components/no-village";
import { requireSession } from "@/lib/auth";
import { loadMapExtras, loadVillageMap } from "@/lib/map/load-map";
import { isUuid } from "@/lib/validations";

export const metadata: Metadata = { title: "Map" };

/**
 * The village map.
 *
 * A Server Component that does the querying and hands flat arrays to
 * `MapScreen`, which owns the Leaflet import — `ssr: false` is only legal from a
 * Client Component, and Leaflet touches `window` the moment it is imported.
 *
 * The queries, and the two constraints on them, are `src/lib/map/load-map.ts`
 * — shared with `/incidents` and `/trends`, which on a phone render this same
 * map with their sheet open.
 *
 * The whole set is sent at once and the period and filters narrow it in the
 * browser. At a village's volume that is a few tens of kilobytes and makes the
 * controls instant; a village that outgrows `MAX_MAP_INCIDENTS` wants
 * clustering, not pagination.
 */
export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireSession("/map");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  const map = await loadVillageMap(villageId);
  if (!map) return <NoVillage />;

  const { ownPending, ...extras } = await loadMapExtras(
    session,
    villageId,
    map.villageName,
  );

  const query = await searchParams;
  // From a report's page. Narrowed to a uuid before it reaches the screen, and
  // the screen ignores one that is not on the map — so it selects nothing the
  // viewer could not already tap.
  const focus = typeof query.incident === "string" && isUuid(query.incident)
    ? query.incident
    : null;

  return (
    <MapScreen
      {...map}
      {...extras}
      incidents={[...ownPending, ...map.incidents]}
      startReporting={query.report === "1"}
      initialSelectedId={focus}
      focusPattern={focus !== null && query.pattern === "1"}
    />
  );
}
