"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { MapIncident } from "@/components/incident-map";

/**
 * The map pin on an incident's detail page.
 *
 * A thin Client Component whose only job is the `next/dynamic` call — `ssr:
 * false` is illegal from a Server Component, and Leaflet dereferences `window`
 * on import. It renders the same `IncidentMap` the full-screen view does, with
 * one pin in it, so the pin looks identical in both places.
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

export function IncidentLocationMap({ incident }: { incident: MapIncident }) {
  // Read once on mount. `IncidentMap` takes the clock as a prop because reading
  // it during render is impure — see the note on that component.
  const [now] = useState(() => Date.now());

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200">
      <IncidentMap
        incidents={[incident]}
        center={{ lat: incident.lat, lng: incident.lng }}
        now={now}
        // One below the map default. The coordinates were fuzzed by 100m before
        // they were stored, so zooming to street level would imply a precision
        // that is not there.
        zoom={15}
        className="h-64 w-full sm:h-80"
      />
    </div>
  );
}
