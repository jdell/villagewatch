"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MapPinned } from "lucide-react";
import type { MapIncident } from "@/components/incident-map";
import { SEVERITIES } from "@/lib/constants";

/**
 * The full-screen map, plus the controls that sit on top of it.
 *
 * This component exists to own two things the map itself should not: the
 * `next/dynamic` call, which is only legal from a Client Component because
 * Leaflet touches `window` on import, and the date range, which is a filter
 * over data already in the browser rather than another round trip. The server
 * sends the village's incidents once; narrowing to seven days is then instant,
 * which is the difference between a toggle people use and one they do not.
 */

const IncidentMap = dynamic(
  () => import("@/components/incident-map").then((m) => m.IncidentMap),
  {
    ssr: false,
    loading: () => <div className="size-full animate-pulse bg-slate-200" />,
  },
);

const RANGES = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 0, label: "All time" },
] as const;

type MapViewProps = {
  incidents: readonly MapIncident[];
  center: { lat: number; lng: number };
  zoom: number;
  villageName: string;
};

export function MapView({
  incidents,
  center,
  zoom,
  villageName,
}: MapViewProps) {
  const [days, setDays] = useState<number>(30);

  /**
   * The clock, read once when the view mounts.
   *
   * A lazy `useState` initialiser rather than a bare `Date.now()` in the body:
   * reading the clock during render is impure and the React Compiler rejects
   * it, and pinning it here also stops the seven-day cutoff sliding underneath
   * the user while they sit on the page.
   */
  const [now] = useState(() => Date.now());

  const visible = useMemo(() => {
    if (days === 0) return incidents;

    const cutoff = now - days * 24 * 60 * 60 * 1000;
    return incidents.filter(
      (incident) => new Date(incident.occurredAt).getTime() >= cutoff,
    );
  }, [incidents, days, now]);

  return (
    // `map-surface` isolates Leaflet's z-index scale from the rest of the page
    // — see the note in globals.css. Without it the zoom control at 1000 sits
    // over the app shell's mobile drawer.
    // `dvh`, not `vh`: `100vh` is the *large* viewport, the height the window
    // would have with the browser chrome retracted. On a phone with the address
    // bar showing, `100vh - 3.5rem` is therefore taller than what is on screen,
    // so the severity legend and the OpenStreetMap attribution sit underneath
    // Safari's toolbar and the page acquires a scroll it should not have. The
    // 3.5rem is the mobile top bar in `app-shell.tsx` — same height, and the two
    // have to keep matching.
    <div className="map-surface relative h-[calc(100dvh-3.5rem)] w-full lg:h-dvh">
      <IncidentMap
        incidents={visible}
        center={center}
        zoom={zoom}
        now={now}
        // Framing the pins beats the village's stored viewport once there is
        // anything to frame, and re-frames when the range changes.
        fitToIncidents={visible.length > 0}
        className="size-full"
      />

      {/* z-index sits above Leaflet's own panes, which top out at 700. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[800] flex flex-wrap items-start justify-between gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto rounded-xl bg-white/95 px-3.5 py-2.5 shadow-lg ring-1 ring-slate-200 backdrop-blur">
          <p className="text-sm font-semibold text-slate-900">{villageName}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {visible.length === 0
              ? "Nothing reported in this period"
              : `${visible.length} ${visible.length === 1 ? "incident" : "incidents"}`}
          </p>
        </div>

        <div
          className="pointer-events-auto inline-flex rounded-xl bg-white/95 p-1 shadow-lg ring-1 ring-slate-200 backdrop-blur"
          role="group"
          aria-label="Date range"
        >
          {RANGES.map((range) => (
            <button
              key={range.value}
              type="button"
              onClick={() => setDays(range.value)}
              aria-pressed={days === range.value}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                days === range.value
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[800] flex justify-center p-3 sm:justify-start sm:p-4">
        <div className="pointer-events-auto rounded-xl bg-white/95 px-3.5 py-2.5 shadow-lg ring-1 ring-slate-200 backdrop-blur">
          <p className="text-xs font-medium text-slate-500">Severity</p>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {SEVERITIES.map((severity) => (
              <li
                key={severity.value}
                className="inline-flex items-center gap-1.5 text-xs text-slate-700"
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: severity.pin }}
                  aria-hidden
                />
                {severity.label}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {incidents.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[750] grid place-items-center p-6">
          <div className="pointer-events-auto max-w-sm rounded-2xl bg-white/95 p-5 text-center shadow-xl ring-1 ring-slate-200 backdrop-blur">
            <span className="mx-auto grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
              <MapPinned className="size-5" aria-hidden />
            </span>
            <h2 className="mt-3 text-base font-semibold text-slate-900">
              Nothing on the map yet
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
              Reports appear here once a coordinator has reviewed them. Yours
              would be the first.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
