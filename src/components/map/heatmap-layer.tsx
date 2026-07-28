"use client";

import { useEffect, useRef } from "react";
import type L from "leaflet";
import { useMap } from "react-leaflet";
import type { MapIncident } from "@/components/incident-map";
import { HEATMAP_CONFIG, toHeatPoints } from "@/lib/heatmap";

/**
 * The heat layer, as a react-leaflet child.
 *
 * `leaflet.heat` is a 2014 Leaflet plugin and behaves like one: it has no
 * module exports at all, it reads `L` off the global scope, and importing it is
 * a side effect that hangs `L.heatLayer` onto whatever Leaflet it finds there.
 * Two consequences shape this file.
 *
 * **The import is dynamic and lives inside the effect.** The plugin touches
 * `document` on load, so it cannot be evaluated on the server — and an effect is
 * the earliest point at which there is definitely a `window`. Every caller
 * already reaches this module through `next/dynamic` with `ssr: false`, so this
 * is the second belt to that brace rather than the only one.
 *
 * **Leaflet has to be loaded first.** Its dist sets `window.L` as a side effect
 * of being imported, which is what the plugin then picks up. `useMap()` cannot
 * return without `react-leaflet` having imported Leaflet, so being inside a
 * `MapContainer` is the guarantee — there is nothing to sequence by hand, and
 * that is exactly why this component refuses to render outside one.
 *
 * The layer is created once and fed new points on every change. Recreating it
 * per render would flash the canvas and drop the plugin's own pan/zoom
 * listeners; `setLatLngs` redraws in place, which is what makes the date-range
 * toggle and the pins/heat switch instant.
 */

type HeatmapLayerProps = {
  incidents: readonly MapIncident[];
  /**
   * Epoch milliseconds the view was rendered at. Passed in rather than read
   * here, so the pins and the heat agree about what "recent" means — see
   * `toHeatPoints`.
   */
  now: number;
};

export function HeatmapLayer({ incidents, now }: HeatmapLayerProps) {
  const map = useMap();
  const layerRef = useRef<L.HeatLayer | null>(null);

  useEffect(() => {
    // Guards the async gap below: an unmount between the import starting and
    // resolving must not add a layer to a map that has gone.
    let live = true;

    async function attach() {
      const leaflet = (await import("leaflet")).default;
      // Side-effect import. It defines `L.heatLayer` and exports nothing.
      await import("leaflet.heat");

      if (!live) return;

      const layer = leaflet.heatLayer([], { ...HEATMAP_CONFIG });
      layer.addTo(map);
      layerRef.current = layer;

      // The points for the render that mounted this. The effect below is what
      // keeps them current afterwards, and it runs before this resolves on the
      // first pass — hence setting them here too rather than relying on it.
      layer.setLatLngs(toHeatPoints(incidents, now));
    }

    void attach();

    return () => {
      live = false;
      const layer = layerRef.current;
      layerRef.current = null;
      if (layer) map.removeLayer(layer);
    };
    // Mount and unmount only. `incidents` deliberately absent: rebuilding the
    // layer on every filter change is what the effect below exists to avoid.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  useEffect(() => {
    layerRef.current?.setLatLngs(toHeatPoints(incidents, now));
  }, [incidents, now]);

  return null;
}
