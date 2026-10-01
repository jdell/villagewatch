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
 *
 * ## The zero-sized canvas
 *
 * `IndexSizeError: The source width is 0` reached Sentry from `/map`, and the
 * cause is not the data. The plugin's `draw` ends in
 * `getImageData(0, 0, width, height)` **unconditionally**, and the canvas is
 * sized from the map container in `_reset` — so any draw while the container is
 * 0 pixels wide or high throws, with ten points or none. That happens on the
 * first load while a dynamic chunk is still laying out, in a card that has not
 * been measured yet, and on a resize through zero. It throws from `onAdd`, from
 * `moveend` and from `setLatLngs` alike, so guarding the data would miss it —
 * and skipping an *empty* `setLatLngs` would be a bug of its own, leaving the
 * previous heat on screen when a filter narrows to nothing.
 *
 * So `guardRedraw` wraps the one method that draws. Two details in it are
 * load-bearing and come from reading the plugin rather than guessing:
 *
 * - **It clears `_frame` itself.** The plugin's `redraw()` does nothing while
 *   `_frame` is set, and only the last line of `_redraw` clears it. A skipped
 *   or failed draw that left it set would freeze the layer for the rest of the
 *   session — no error, just a heatmap that never changes again.
 * - **It listens for `resize`, which the plugin does not.** The canvas is only
 *   resized in `_reset`, which the plugin runs on `moveend`. A map that came up
 *   at zero size would otherwise stay blank until somebody panned it.
 */

/** The private parts of `leaflet.heat` the guard touches. Not in its types. */
type HeatInternals = {
  _map?: L.Map | null;
  _frame?: number | null;
  _redraw: () => void;
  _reset: () => void;
};

function guardRedraw(layer: L.HeatLayer): void {
  const heat = layer as unknown as HeatInternals;
  const draw = heat._redraw;

  heat._redraw = function guarded(this: HeatInternals) {
    const size = this._map?.getSize();

    if (!size || size.x <= 0 || size.y <= 0) {
      // Nothing to draw into. Clear the frame so the next redraw can run.
      this._frame = null;
      return;
    }

    try {
      draw.call(this);
    } catch (cause) {
      this._frame = null;
      // A canvas fault costs this frame of heat, never the map.
      console.warn("Heat layer could not draw this frame", cause);
    }
  };
}

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
      // Before `addTo`, whose `onAdd` draws straight away.
      guardRedraw(layer);
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

  // The canvas is resized only in `_reset`, which the plugin runs on `moveend`
  // and never on `resize` — see the header.
  useEffect(() => {
    const onResize = () => {
      const layer = layerRef.current as unknown as HeatInternals | null;
      layer?._reset();
    };

    map.on("resize", onResize);
    return () => {
      map.off("resize", onResize);
    };
  }, [map]);

  useEffect(() => {
    // An empty array is sent, not skipped: it is how the heat clears when a
    // filter leaves nothing to show.
    layerRef.current?.setLatLngs(toHeatPoints(incidents, now));
  }, [incidents, now]);

  return null;
}
