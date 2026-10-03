"use client";

import "leaflet/dist/leaflet.css";

import { useEffect } from "react";
import L from "leaflet";
import { Circle, MapContainer, TileLayer, useMap } from "react-leaflet";
import { MAP_DEFAULTS } from "@/lib/constants";

/**
 * The circle under the radius slider — how far "Within 500m" actually reaches
 * from home. Only ever loaded through `next/dynamic` with `ssr: false`, because
 * Leaflet touches `window` on import.
 *
 * A picture, not a map: no dragging, no zoom, nothing focusable, hidden from
 * assistive technology — the slider's own label says the distance in words.
 * The centre is the resident's own approximate home location, already fuzzed by
 * `HOME_LOCATION_FUZZ_METERS` when it was stored, on their own screen; nothing
 * here sends it anywhere but the tile server's view of the map's area, which
 * every map in the app already gives it.
 *
 * The audience test in `notifications.ts` adds `LOCATION_FUZZ_METERS` to the
 * radius; this draws the radius the resident chose, which is the promise they
 * are making to themselves, not the arithmetic behind it.
 */

function Frame({ center, radius }: { center: L.LatLngExpression; radius: number }) {
  const map = useMap();
  useEffect(() => {
    const bounds = L.latLng(center).toBounds(radius * 2.4);
    map.fitBounds(bounds, { animate: false });
  }, [map, center, radius]);
  return null;
}

export function RadiusPreviewMap({
  center,
  radius,
}: {
  center: { lat: number; lng: number };
  /** Metres. */
  radius: number;
}) {
  const at: [number, number] = [center.lat, center.lng];

  return (
    <div aria-hidden className="map-surface vw-muted h-40 overflow-hidden rounded-[14px]">
      <MapContainer
        center={at}
        zoom={MAP_DEFAULTS.zoom}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        boxZoom={false}
        keyboard={false}
        zoomControl={false}
        className="size-full"
      >
        <TileLayer url={MAP_DEFAULTS.tileUrl} attribution={MAP_DEFAULTS.tileAttribution} />
        <Circle
          center={at}
          radius={radius}
          pathOptions={{
            color: "#0284c7",
            weight: 2,
            fillColor: "#0284c7",
            fillOpacity: 0.12,
          }}
        />
        <Circle
          center={at}
          radius={6}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#0284c7", fillOpacity: 1 }}
        />
        <Frame center={at} radius={radius} />
      </MapContainer>
    </div>
  );
}
