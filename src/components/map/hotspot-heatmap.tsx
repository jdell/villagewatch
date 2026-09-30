"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { MapIncident } from "@/components/incident-map";
import {
  TimelineSlider,
  TimelineToggle,
  useTimelineOpen,
  useTimelineSelection,
} from "@/components/map/timeline-slider";
import { HEATMAP_LEGEND_CSS } from "@/lib/heatmap";
import { timelineBounds, withinSelection } from "@/lib/timeline";

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
 * The one control is the timeline, and it is **below** the map rather than on
 * it, because the map is not interactive and should not look as though it is.
 * It is the single-handle variant: the start is pinned to the first day of the
 * period and the handle scrubs the end forward, so a coordinator can watch the
 * heat build up across the period — which is the question a density picture
 * this size can answer. A two-handled window would ask for a precision 200px
 * cannot give. The viewport frames the whole period and holds still while it
 * moves, for the reason `map-view.tsx` gives.
 *
 * This file exists to own the `next/dynamic` call, which is only legal from a
 * Client Component — Leaflet touches `window` on import, and `leaflet.heat`
 * touches `document`.
 */

/** Separate from `/map`'s: wanting it there says nothing about wanting it here. */
const TIMELINE_STORAGE_KEY = "villagewatch:heatmap-timeline";
const TIMELINE_PANEL_ID = "hotspot-timeline";

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
  /**
   * The dashboard's period, as ISO strings — the slider's track. Omitted, the
   * track runs from the earliest report to today.
   */
  period?: { from: string; to: string } | null;
};

export function HotspotHeatmap({
  incidents,
  center,
  zoom,
  period = null,
}: HotspotHeatmapProps) {
  // Pinned once, like the full map: the recency decay must not slide while a
  // coordinator reads the page, and reading the clock in a render is impure.
  const [now] = useState(() => Date.now());
  const [nowDate] = useState(() => new Date(now));

  const bounds = useMemo(
    () =>
      timelineBounds(
        {
          from: period ? new Date(period.from) : null,
          to: period ? new Date(period.to) : null,
        },
        incidents.map((incident) => incident.occurredAt),
        nowDate,
      ),
    [period, incidents, nowDate],
  );

  const { selection, setSelection, narrowed } = useTimelineSelection(bounds);
  const [timelineOpen, setTimelineOpen] = useTimelineOpen(TIMELINE_STORAGE_KEY);

  const visible = useMemo(() => {
    if (!narrowed) return incidents;
    const within = withinSelection(bounds, selection);
    return incidents.filter((incident) => within(incident.occurredAt));
  }, [incidents, bounds, selection, narrowed]);

  return (
    <figure className="mt-4">
      {/*
        `map-surface` for the same reason the full map has it — Leaflet's panes
        start at z-index 400 and its controls at 1000, which would otherwise sit
        over the app shell's mobile drawer from inside a dashboard card.
      */}
      <div className="map-surface h-52 w-full overflow-hidden rounded-xl ring-1 ring-slate-200">
        <IncidentMap
          incidents={visible}
          center={center}
          zoom={zoom}
          now={now}
          mode="heat"
          interactive={false}
          // Frame the reports rather than the village's stored viewport: at this
          // size a parish-wide view of three blobs in one corner says nothing.
          fitToIncidents={incidents.length > 0}
          fitTo={incidents}
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

        <span className="inline-flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            Quieter
            <span
              className="h-2 w-16 rounded-full"
              style={{ background: HEATMAP_LEGEND_CSS }}
              aria-hidden
            />
            Busier
          </span>

          {incidents.length > 0 && (
            <TimelineToggle
              open={timelineOpen}
              onToggle={() => setTimelineOpen(!timelineOpen)}
              controls={TIMELINE_PANEL_ID}
              narrowed={narrowed}
              className="ring-1 ring-slate-200"
            />
          )}
        </span>
      </figcaption>

      {timelineOpen && incidents.length > 0 && (
        <TimelineSlider
          id={TIMELINE_PANEL_ID}
          variant="end"
          bounds={bounds}
          selection={selection}
          onChange={setSelection}
          now={nowDate}
          shown={visible.length}
          total={incidents.length}
          className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200"
        />
      )}
    </figure>
  );
}
