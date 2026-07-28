"use client";

import "leaflet/dist/leaflet.css";

import { useEffect } from "react";
import Link from "next/link";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { IncidentTypeIcon } from "@/components/incident-type-icon";
import { HeatmapLayer } from "@/components/map/heatmap-layer";
import { SeverityBadge } from "@/components/severity-badge";
import {
  INCIDENT_TYPE_LABELS,
  MAP_DEFAULTS,
  SEVERITY_PIN_COLORS,
} from "@/lib/constants";
import { formatDateTime, formatTimeAgo } from "@/lib/format";

/**
 * The village map: every incident as a pin, coloured by severity.
 *
 * Leaflet reaches for `window` on import, so this module must only ever be
 * pulled in through `next/dynamic` with `ssr: false` — see `map-view.tsx` and
 * `incident-location-map.tsx`, which are the two Client Components that do it.
 *
 * Every pin here is already fuzzed. `Incident.lat`/`lng` were jittered by
 * `LOCATION_FUZZ_METERS` on the way into the database, so nothing on this map
 * shows where a reporter actually stood, and there is no un-fuzzed copy to leak
 * (domain rule 2).
 */

export type MapIncident = {
  id: string;
  reference: string;
  type: IncidentType;
  severity: Severity;
  title: string;
  /** The anonymised public text. Never `rawDescription`. */
  description: string;
  /** ISO 8601 — a string rather than a Date, so it crosses the RSC boundary flat. */
  occurredAt: string;
  locationText: string | null;
  lat: number;
  lng: number;
  recurring: boolean;
};

/**
 * What is drawn over the tiles.
 *
 * `pins` is the default everywhere and the behaviour this map has always had.
 * `heat` swaps the markers for a density canvas; `both` layers the pins on top of
 * it, which is the combination a coordinator wants when they have spotted a warm
 * patch and need to know which reports made it.
 */
export type MapMode = "pins" | "heat" | "both";

type IncidentMapProps = {
  incidents: readonly MapIncident[];
  center: { lat: number; lng: number };
  zoom?: number;
  /** Fit the viewport to the pins instead of using `center`/`zoom`. */
  fitToIncidents?: boolean;
  mode?: MapMode;
  /**
   * False for a map that is a picture rather than a map — the density thumbnail
   * on the dashboard. Drops dragging, both zooms and the zoom control, so a
   * coordinator scrolling the page past a 200px map does not zoom it by accident.
   * The OpenStreetMap attribution stays either way; it is a licence condition,
   * not a control.
   */
  interactive?: boolean;
  /**
   * Epoch milliseconds the page was rendered at, used to size pins by recency.
   *
   * Passed in rather than read from the clock here for two reasons: calling
   * `Date.now()` during render is impure and the React Compiler rejects it, and
   * a server-rendered "recent" that disagreed with the client's would change
   * pin sizes on hydration.
   */
  now: number;
  className?: string;
};

const RECENT_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Pins are built once per (colour, size) pair rather than per incident — a
 * village with 500 incidents would otherwise build 500 identical DOM icons.
 */
const iconCache = new Map<string, L.DivIcon>();

function pinIcon(severity: Severity, recent: boolean): L.DivIcon {
  const key = `${severity}-${recent}`;
  const cached = iconCache.get(key);
  if (cached) return cached;

  const colour = SEVERITY_PIN_COLORS[severity];
  // Sized by recency, as the architecture specifies: a bigger pin reads as
  // "this week" before anyone has read a word of it.
  const width = recent ? 30 : 22;
  const height = Math.round(width * 1.3);

  const icon = L.divIcon({
    className: "",
    html: `
      <svg width="${width}" height="${height}" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M16 1C8.8 1 3 6.8 3 14c0 9.2 11.3 25 12.1 26.1a1.1 1.1 0 0 0 1.8 0C17.7 39 29 23.2 29 14 29 6.8 23.2 1 16 1z"
              fill="${colour}" stroke="#ffffff" stroke-width="2.5" />
        <circle cx="16" cy="14" r="4.5" fill="#ffffff" />
      </svg>`,
    iconSize: [width, height],
    iconAnchor: [width / 2, height],
    popupAnchor: [0, -height + 4],
  });

  iconCache.set(key, icon);
  return icon;
}

/**
 * Frames the pins that are actually on screen.
 *
 * Runs on every change to the incident set, which is what makes the date-range
 * toggle useful: narrowing to the last seven days zooms into where this week's
 * trouble is rather than leaving the whole parish in view.
 */
function FitBounds({
  incidents,
  enabled,
}: {
  incidents: readonly MapIncident[];
  enabled: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!enabled || incidents.length === 0) return;

    const bounds = L.latLngBounds(
      incidents.map((incident) => [incident.lat, incident.lng] as [number, number]),
    );

    map.fitBounds(bounds, {
      padding: [48, 48],
      // Without a ceiling a single incident zooms to building level, which
      // undoes the point of fuzzing the coordinates in the first place.
      maxZoom: MAP_DEFAULTS.zoom + 1,
    });
  }, [map, incidents, enabled]);

  return null;
}

export function IncidentMap({
  incidents,
  center,
  zoom = MAP_DEFAULTS.zoom,
  fitToIncidents = false,
  mode = "pins",
  interactive = true,
  now,
  className = "size-full",
}: IncidentMapProps) {
  // An empty array rather than a conditional around the loop below: the markers
  // are the same markers in every mode, and `heat` is simply a mode with none.
  const pins = mode === "heat" ? [] : incidents;

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={zoom}
      minZoom={MAP_DEFAULTS.minZoom}
      maxZoom={MAP_DEFAULTS.maxZoom}
      scrollWheelZoom={interactive}
      dragging={interactive}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
      zoomControl={interactive}
      className={className}
    >
      <TileLayer
        url={MAP_DEFAULTS.tileUrl}
        attribution={MAP_DEFAULTS.tileAttribution}
      />

      <FitBounds incidents={incidents} enabled={fitToIncidents} />

      {/*
        Under the pins, always. Leaflet puts the heat canvas in the overlay pane
        and markers in the marker pane above it, so "both" needs no z-index of
        its own — and a heat blob drawn over a pin would hide the one thing that
        is clickable.
      */}
      {mode !== "pins" && <HeatmapLayer incidents={incidents} now={now} />}

      {pins.map((incident) => {
        const occurred = new Date(incident.occurredAt);
        const recent = now - occurred.getTime() <= RECENT_MS;

        return (
          <Marker
            key={incident.id}
            position={[incident.lat, incident.lng]}
            icon={pinIcon(incident.severity, recent)}
            alt={`${INCIDENT_TYPE_LABELS[incident.type]}: ${incident.title}`}
          >
            <Popup>
              <div className="min-w-56 max-w-72">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    <IncidentTypeIcon
                      type={incident.type}
                      className="size-3.5"
                    />
                    {INCIDENT_TYPE_LABELS[incident.type]}
                  </span>
                  <SeverityBadge severity={incident.severity} size="sm" />
                </div>

                <h3 className="mt-2 text-sm font-semibold leading-snug text-slate-900">
                  {incident.title}
                </h3>

                <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-slate-600">
                  {incident.description}
                </p>

                <p className="mt-2 text-xs text-slate-500">
                  <time
                    dateTime={incident.occurredAt}
                    title={formatDateTime(occurred)}
                  >
                    {formatTimeAgo(occurred)}
                  </time>
                  {incident.locationText ? ` · ${incident.locationText}` : ""}
                </p>

                {incident.recurring && (
                  <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                    Part of a pattern nearby
                  </p>
                )}

                <Link
                  href={`/incidents/${incident.id}`}
                  className="mt-2.5 inline-block text-xs font-semibold text-brand-700 underline underline-offset-2"
                >
                  View details
                </Link>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
