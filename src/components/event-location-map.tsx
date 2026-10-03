"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { MapEvent } from "@/components/incident-map";

/**
 * The one pin on an event's own page. `ReportMapHeader`'s twin, drawing an
 * event rather than a report through the same map component — the
 * `next/dynamic` call is here because Leaflet touches `window` on import.
 */

const IncidentMap = dynamic(
  () => import("@/components/incident-map").then((m) => m.IncidentMap),
  {
    ssr: false,
    loading: () => (
      <div className="h-64 w-full animate-pulse rounded-2xl bg-slate-100" />
    ),
  },
);

export function EventLocationMap({ event }: { event: MapEvent }) {
  // Read once on mount; reading the clock during render is impure.
  const [now] = useState(() => Date.now());

  return (
    <div className="map-surface overflow-hidden rounded-2xl border border-slate-200">
      <IncidentMap
        incidents={[]}
        events={[event]}
        center={{ lat: event.lat, lng: event.lng }}
        now={now}
        // The point was fuzzed on the way in, so street level would claim a
        // precision it does not have — the same zoom the report page uses.
        zoom={15}
        label="Map showing roughly where this event is"
        className="h-64 w-full sm:h-80"
      />
    </div>
  );
}
