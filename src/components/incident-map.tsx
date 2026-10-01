"use client";

import "leaflet/dist/leaflet.css";

import { useEffect } from "react";
import Link from "next/link";
import L from "leaflet";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  ZoomControl,
  useMap,
} from "react-leaflet";
import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { IncidentTypeIcon } from "@/components/incident-type-icon";
import { HeatmapLayer } from "@/components/map/heatmap-layer";
import { SeverityBadge } from "@/components/severity-badge";
import {
  EVENT_PIN_COLOR,
  INCIDENT_TYPE_LABELS,
  MAP_DEFAULTS,
  SEVERITY_LABELS,
  SEVERITY_PIN_COLORS,
} from "@/lib/constants";
import {
  formatDateTime,
  formatEventWhen,
  formatTimeAgo,
} from "@/lib/format";

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

/**
 * A community event on the map — `EventView` narrowed to what a pin needs.
 * Coordinates were fuzzed on the way in (domain rule 2), like an incident's.
 */
export type MapEvent = {
  id: string;
  title: string;
  category: string;
  locationText: string | null;
  startsAt: string;
  endsAt: string | null;
  lat: number;
  lng: number;
};

type IncidentMapProps = {
  incidents: readonly MapIncident[];
  center: { lat: number; lng: number };
  zoom?: number;
  /** Fit the viewport to the pins instead of using `center`/`zoom`. */
  fitToIncidents?: boolean;
  /**
   * What to frame when `fitToIncidents` is on, where that differs from what is
   * drawn. The timeline slider narrows `incidents` on every step of a drag, and
   * framing *those* would re-zoom the map under the reader's finger each time —
   * so the two map surfaces pass the whole period here and the viewport holds
   * still while the slider decides what is on it. Defaults to `incidents`.
   */
  fitTo?: readonly MapIncident[];
  /**
   * Community events, drawn as blue calendar pins over everything else. Never
   * in the heat layer — density is a picture of what was reported, and a
   * litter pick is not a report — and never framed by `fitToIncidents`, which
   * describes the incidents.
   */
  events?: readonly MapEvent[];
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
  /**
   * The map's accessible name — "Map of reported incidents in Histon". Leaflet
   * makes the container focusable and gives it no name, so without this a
   * screen reader announces an unnamed group. Ignored on a map with
   * `interactive={false}`, which is hidden from assistive technology instead.
   */
  label?: string;
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

let eventIconInstance: L.DivIcon | null = null;

/**
 * The event pin: the incident pin's shape, in blue, with a calendar where the
 * incident pin has a dot — so it reads as "something on" before it reads as a
 * colour, which matters to anybody who cannot tell blue from purple. One size:
 * recency is what sizes an incident pin, and an event has none.
 */
function eventIcon(): L.DivIcon {
  if (eventIconInstance) return eventIconInstance;

  eventIconInstance = L.divIcon({
    className: "",
    html: `
      <svg width="28" height="36" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M16 1C8.8 1 3 6.8 3 14c0 9.2 11.3 25 12.1 26.1a1.1 1.1 0 0 0 1.8 0C17.7 39 29 23.2 29 14 29 6.8 23.2 1 16 1z"
              fill="${EVENT_PIN_COLOR}" stroke="#ffffff" stroke-width="2.5" />
        <svg x="8.5" y="6.5" width="15" height="15" viewBox="0 0 24 24" fill="none"
             stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 2v4" /><path d="M16 2v4" />
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <path d="M3 10h18" />
        </svg>
      </svg>`,
    iconSize: [28, 36],
    iconAnchor: [14, 36],
    popupAnchor: [0, -32],
  });

  return eventIconInstance;
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

/**
 * Names the map container, or hides it.
 *
 * Leaflet renders the container itself, so this sets its attributes from inside
 * the `MapContainer`. An interactive map is a labelled region; the dashboard's
 * density thumbnail (`interactive={false}`) is a picture whose `<figcaption>`
 * already says what it shows, so it is taken out of the accessibility tree and
 * the tab order rather than announced as a second, unusable map.
 */
function MapAccessibility({
  label,
  interactive,
}: {
  label: string;
  interactive: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    const container = map.getContainer();

    if (interactive) {
      container.setAttribute("role", "region");
      container.setAttribute("aria-label", label);
      container.removeAttribute("aria-hidden");
    } else {
      container.setAttribute("aria-hidden", "true");
      container.setAttribute("tabindex", "-1");
    }
  }, [map, label, interactive]);

  return null;
}

/**
 * Focus into a popup when it opens, and back to its pin when it closes.
 *
 * Leaflet moves focus nowhere, and the popup is later in the DOM than every
 * remaining pin — so its link was only reachable by tabbing past all of them.
 * Escape already closes it. Shared by incident and event popups.
 *
 * On the `<Popup>`'s own `add`/`remove`, which are exactly "opened" and
 * "closed" and need nothing from the marker but `_source` — the layer the popup
 * is bound to, private in Leaflet's types and stable across 1.x. The focus waits a
 * tick because react-leaflet renders the content through a portal after the
 * popup is added — a timeout rather than an animation frame, which a browser
 * pauses in a background tab.
 */
const POPUP_FOCUS = {
  add: (event: L.LeafletEvent) => {
    const popup = event.target as L.Popup;
    setTimeout(() =>
      popup.getElement()?.querySelector<HTMLElement>("a[href]")?.focus(),
    );
  },
  remove: (event: L.LeafletEvent) => {
    const source = (event.target as L.Popup & { _source?: L.Marker })._source;
    source?.getElement()?.focus();
  },
};

/**
 * What a screen reader says for a pin. Leaflet makes every marker a focusable
 * `role="button"`, but it only applies `alt` to an `<img>` icon and these are
 * div icons with the drawing `aria-hidden` — so without a name every pin was
 * announced as just "button". An event's says so first, so the two kinds of
 * pin cannot be confused by somebody who cannot see that one is blue.
 */
function pinLabel(incident: MapIncident, occurred: Date): string {
  return `${SEVERITY_LABELS[incident.severity]} severity, ${
    INCIDENT_TYPE_LABELS[incident.type]
  }: ${incident.title}, ${formatTimeAgo(occurred)}`;
}

function eventPinLabel(event: MapEvent): string {
  return `Event, ${event.category}: ${event.title}, ${formatEventWhen(
    event.startsAt,
    event.endsAt,
  )}`;
}

/** Sets a marker's accessible name on the element Leaflet made focusable. */
function nameMarker(name: string) {
  return {
    add: (event: L.LeafletEvent) =>
      (event.target as L.Marker).getElement()?.setAttribute("aria-label", name),
  };
}

export function IncidentMap({
  incidents,
  center,
  zoom = MAP_DEFAULTS.zoom,
  fitToIncidents = false,
  fitTo,
  events = [],
  mode = "pins",
  interactive = true,
  now,
  className = "size-full",
  label = "Map of reported incidents",
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
      /*
        Never Leaflet's own control. Its default corner is `topleft`, which on
        this map is where `map-view.tsx` puts the village card — 10px of margin
        against a card that starts 12px in, so on a phone the + and - buttons
        landed on top of the village's name and its incident count. The control
        wins that overlap, because Leaflet numbers its controls at 1000 and the
        overlays are deliberately numbered against that scale at 800 (see the
        note on `.map-surface` in globals.css), so what a resident actually got
        was two zoom buttons sitting over the one label that says which village
        they are looking at.
      */
      zoomControl={false}
      className={className}
    >
      <TileLayer
        url={MAP_DEFAULTS.tileUrl}
        attribution={MAP_DEFAULTS.tileAttribution}
      />

      {/*
        Bottom right instead, which is the one corner no map in this codebase
        puts anything of its own in: the village card is top left, the layer and
        period controls are top right, and the legend runs along the bottom from
        the left. Leaflet inserts a bottom control *before* whatever is already
        in that corner, so the attribution stays flush against the edge with the
        buttons stacked above it rather than under them — and `map-view.tsx`
        keeps its bottom row clear of the column they occupy.

        Only when the map is a map. `interactive={false}` is the dashboard's
        density thumbnail, which has no zoom to control.
      */}
      {interactive && <ZoomControl position="bottomright" />}

      <FitBounds incidents={fitTo ?? incidents} enabled={fitToIncidents} />
      <MapAccessibility label={label} interactive={interactive} />

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
            eventHandlers={nameMarker(pinLabel(incident, occurred))}
          >
            <Popup eventHandlers={POPUP_FOCUS}>
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

                {/*
                  The reference, on the pin as well as the card and the detail
                  page. A resident standing in the lane on the phone to a PCSO
                  is reading it off whichever surface they had open, and the map
                  is the one they had open.
                */}
                <p className="mt-1 font-mono text-xs text-slate-500">
                  {incident.reference}
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

      {/*
        After the incidents, so Leaflet stacks them on top: there are few of
        them, and a calendar pin buried under a cluster of reports is one
        nobody finds.
      */}
      {events.map((event) => (
        <Marker
          key={`event-${event.id}`}
          position={[event.lat, event.lng]}
          icon={eventIcon()}
          eventHandlers={nameMarker(eventPinLabel(event))}
          zIndexOffset={500}
        >
          <Popup eventHandlers={POPUP_FOCUS}>
            <div className="min-w-56 max-w-72">
              <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
                {event.category}
              </span>
              <h3 className="mt-2 text-sm font-semibold leading-snug text-slate-900">
                {event.title}
              </h3>
              <p className="mt-1 text-xs font-medium text-brand-800">
                {formatEventWhen(event.startsAt, event.endsAt)}
              </p>
              {event.locationText && (
                <p className="mt-1 text-xs text-slate-500">{event.locationText}</p>
              )}
              <Link
                href={`/events/${event.id}`}
                className="mt-2.5 inline-block text-xs font-semibold text-brand-700 underline underline-offset-2"
              >
                View event
              </Link>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
