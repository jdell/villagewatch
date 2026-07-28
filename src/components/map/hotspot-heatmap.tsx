"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { MapIncident } from "@/components/incident-map";
import { HEATMAP_LEGEND_CSS } from "@/lib/heatmap";

/**
 * The dashboard's density thumbnail: where this period's reports actually are.
 *
 * The hotspot list beside it counts `locationText` — the landmark residents
 * typed — which is the right unit for a police report and a poor one for
 * geography. "Mill Lane" and "the bus stop on Mill Lane" are two rows in that
 * list and one place on the ground, and a report filed without a landmark is in
 * neither. This is the same period read off the coordinates instead, so the two
 * views cover each other's blind spots.
 *
 * Deliberately **heat only, and not interactive**. No pins, no toggle, no
 * popups: a coordinator wanting to read individual reports has the full map one
 * click away, and a 200px map that panned under a scrolling finger would be a
 * nuisance rather than a feature. `interactive={false}` is what turns the zoom
 * and the dragging off.
 *
 * This file exists to own the `next/dynamic` call, which is only legal from a
 * Client Component — Leaflet touches `window` on import, and `leaflet.heat`
 * touches `document`.
 */

const IncidentMap = dynamic(
  () => import("@/components/incident-map").then((m) => m.IncidentMap),
  {
    ssr: false,
    loading: () => (
      <div className="size-full animate-pulse rounded-xl bg-slate-100" />
    ),
  },
);

type HotspotHeatmapProps = {
  incidents: readonly MapIncident[];
  center: { lat: number; lng: number };
  zoom: number;
};

export function HotspotHeatmap({
  incidents,
  center,
  zoom,
}: HotspotHeatmapProps) {
  // Pinned once, like the full map: the recency decay must not slide while a
  // coordinator reads the page, and reading the clock in a render is impure.
  const [now] = useState(() => Date.now());

  return (
    <figure className="mt-4">
      {/*
        `map-surface` for the same reason the full map has it — Leaflet's panes
        start at z-index 400 and its controls at 1000, which would otherwise sit
        over the app shell's mobile drawer from inside a dashboard card.
      */}
      <div className="map-surface h-52 w-full overflow-hidden rounded-xl ring-1 ring-slate-200">
        <IncidentMap
          incidents={incidents}
          center={center}
          zoom={zoom}
          now={now}
          mode="heat"
          interactive={false}
          // Frame the reports rather than the village's stored viewport: at this
          // size a parish-wide view of three blobs in one corner says nothing.
          fitToIncidents={incidents.length > 0}
          className="size-full"
        />
      </div>

      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {incidents.length === 0
            ? "No published report in this period has coordinates."
            : `${incidents.length} published report${
                incidents.length === 1 ? "" : "s"
              } with a location, weighted by severity and how recent they are.`}
        </span>

        <span className="inline-flex items-center gap-1.5">
          Quieter
          <span
            className="h-2 w-16 rounded-full"
            style={{ background: HEATMAP_LEGEND_CSS }}
            aria-hidden
          />
          Busier
        </span>
      </figcaption>
    </figure>
  );
}
