"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { MapPin } from "lucide-react";
import type { MapIncident } from "@/components/incident-map";

/**
 * The 200px map across the top of a report's page.
 *
 * A picture rather than a map — `interactive={false}`, so somebody scrolling
 * the page with a thumb on it does not drag Leaflet instead — and the whole
 * strip links to the same report on `/map`, which is where a map is for
 * moving around. The pin is the glyph disc the map draws, so the report looks
 * the same in both places.
 *
 * "Approximate location" is on the picture rather than in a caption under it,
 * because the caption is the thing nobody reads: the coordinates were fuzzed by
 * `LOCATION_FUZZ_METERS` before they were stored (domain rule 2), and a pin
 * that looks exact is a claim about somebody's front door.
 */

const IncidentMap = dynamic(
  () => import("@/components/incident-map").then((m) => m.IncidentMap),
  {
    ssr: false,
    loading: () => <div className="h-full w-full animate-pulse bg-slate-200" />,
  },
);

export function ReportMapHeader({ incident }: { incident: MapIncident }) {
  const [now] = useState(() => Date.now());

  return (
    <div className="map-surface vw-muted relative h-[200px] w-full overflow-hidden bg-slate-200 lg:rounded-[18px]">
      <IncidentMap
        incidents={[incident]}
        center={{ lat: incident.lat, lng: incident.lng }}
        now={now}
        // One below the map default: the coordinates were fuzzed before they
        // were stored, so street level would imply a precision not there.
        zoom={15}
        interactive={false}
        pinStyle="glyph"
        className="h-full w-full"
      />
      <Link
        href={`/map?incident=${incident.id}`}
        aria-label="Open this report on the village map"
        className="absolute inset-0 z-[810]"
      />
      <span className="pointer-events-none absolute bottom-3 left-3 z-[820] inline-flex h-7 items-center gap-1.5 rounded-full bg-white/95 px-2.5 text-xs font-semibold text-[#334155] shadow-[0_1px_2px_rgba(15,23,42,.08),0_4px_12px_rgba(15,23,42,.12)]">
        <MapPin className="size-3.5 text-[#64748b]" aria-hidden />
        Approximate location
      </span>
    </div>
  );
}
