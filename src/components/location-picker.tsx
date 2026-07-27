"use client";

import "leaflet/dist/leaflet.css";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import { Crosshair, Loader2, MapPin } from "lucide-react";
import { MAP_DEFAULTS } from "@/lib/constants";
import { formatCoordinates } from "@/lib/format";

/**
 * Drop a pin on the village map.
 *
 * Leaflet reaches for `window` as soon as it is imported, so this module must
 * only ever be pulled in through `next/dynamic` with `ssr: false` from a Client
 * Component — see `incident-form.tsx`.
 *
 * The coordinates handed back are the exact point the reporter chose. They are
 * jittered by `LOCATION_FUZZ_METERS` on the server before being written, so the
 * precise position never reaches the database (domain rule 2). Doing the jitter
 * here instead would be worse in two ways: the reporter would see their pin
 * jump, and a modified client could simply skip it.
 */

export type LocationValue = { lat: number; lng: number };

type LocationPickerProps = {
  value: LocationValue | null;
  onChange: (value: LocationValue) => void;
  /** Village centre — where the map opens before anything is chosen. */
  center: LocationValue;
  zoom?: number;
  className?: string;
};

/**
 * Inline SVG marker. Leaflet's default icon resolves its PNGs by relative URL,
 * which breaks under a bundler; a div icon has no assets to lose.
 */
function pinIcon() {
  return L.divIcon({
    className: "",
    html: `
      <svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M16 1C8.8 1 3 6.8 3 14c0 9.2 11.3 25 12.1 26.1a1.1 1.1 0 0 0 1.8 0C17.7 39 29 23.2 29 14 29 6.8 23.2 1 16 1z"
              fill="#2563eb" stroke="#ffffff" stroke-width="2" />
        <circle cx="16" cy="14" r="5" fill="#ffffff" />
      </svg>`,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
  });
}

/** Turns a tap anywhere on the map into a pin. */
function ClickHandler({ onChange }: { onChange: (value: LocationValue) => void }) {
  useMapEvents({
    click(event) {
      onChange({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });

  return null;
}

/**
 * Pans when the value changes from outside — the "use my location" button, or
 * returning to this step with a pin already dropped.
 */
function Recenter({ value }: { value: LocationValue | null }) {
  const map = useMap();

  useEffect(() => {
    if (value) map.panTo([value.lat, value.lng], { animate: true });
  }, [map, value]);

  return null;
}

export function LocationPicker({
  value,
  onChange,
  center,
  zoom = MAP_DEFAULTS.zoom,
  className = "",
}: LocationPickerProps) {
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const icon = useMemo(() => pinIcon(), []);

  function useMyLocation() {
    if (!("geolocation" in navigator)) {
      setGeoError("This device cannot share its location.");
      return;
    }

    setLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false);
        onChange({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        setLocating(false);
        setGeoError(
          error.code === error.PERMISSION_DENIED
            ? "Location access was declined — tap the map instead."
            : "Could not get a location fix — tap the map instead.",
        );
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  return (
    <div className={`space-y-3 ${className}`}>
      {/* `map-surface` isolates Leaflet's z-index scale — see globals.css. */}
      <div className="map-surface overflow-hidden rounded-2xl border border-slate-200">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={zoom}
          minZoom={MAP_DEFAULTS.minZoom}
          maxZoom={MAP_DEFAULTS.maxZoom}
          scrollWheelZoom
          className="h-72 w-full sm:h-96"
        >
          <TileLayer
            url={MAP_DEFAULTS.tileUrl}
            attribution={MAP_DEFAULTS.tileAttribution}
          />
          <ClickHandler onChange={onChange} />
          <Recenter value={value} />

          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={icon}
              draggable
              eventHandlers={{
                dragend(event) {
                  const { lat, lng } = event.target.getLatLng();
                  onChange({ lat, lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-sm text-slate-600">
          <MapPin className="size-4 shrink-0 text-slate-400" aria-hidden />
          {value ? (
            <span>
              Pin dropped at{" "}
              <span className="font-mono text-xs">
                {formatCoordinates(value.lat, value.lng)}
              </span>
            </span>
          ) : (
            <span>Tap the map to place a pin, or drag it to adjust.</span>
          )}
        </p>

        <button
          type="button"
          onClick={useMyLocation}
          disabled={locating}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
        >
          {locating ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Crosshair className="size-4" aria-hidden />
          )}
          {locating ? "Finding you…" : "Use my location"}
        </button>
      </div>

      {geoError && <p className="text-sm text-amber-700">{geoError}</p>}

      <p className="text-xs text-slate-500">
        Pins are shifted slightly before they are saved, so the map never shows
        exactly where you were standing.
      </p>
    </div>
  );
}
