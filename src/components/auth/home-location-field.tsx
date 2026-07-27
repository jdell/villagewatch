"use client";

import dynamic from "next/dynamic";
import { MapPinHouse } from "lucide-react";
import type { LocationValue } from "@/components/location-picker";
import { HOME_LOCATION_FUZZ_METERS } from "@/lib/constants";

/**
 * "Pin your approximate area" — the home location step, shared by both halves
 * of registration.
 *
 * `/register` (password) and `/welcome` (Google) had a copy of this each. They
 * are the two screens that write `User.homeLat`/`homeLng`, they must make the
 * same promise about what happens to the pin, and a promise maintained in two
 * files is one that will eventually be true in one of them.
 *
 * ## Why it is optional, and why it is worth the space anyway
 *
 * Without a home location a resident falls into the village-wide audience:
 * `residentsToNotify` in `src/lib/notifications.ts` includes anyone the distance
 * test cannot be run against, because a radius is a way to hear *less*, not a
 * reason to silently drop an alert. So skipping costs nothing today — it just
 * means the notification radius on `/settings` has nothing to measure from.
 * Encouraged, never required, and the Skip link says so in as many words rather
 * than leaving a resident to infer it from an absent asterisk.
 *
 * ## The jitter is named, with a number
 *
 * `HOME_LOCATION_FUZZ_METERS` is interpolated rather than written into the
 * sentence, so the figure on screen cannot drift from the one the server
 * applies. A home location is the most re-identifying coordinate in the system
 * — an exact one is an address — and "we shift it a bit" is not a claim anybody
 * can weigh. The jitter is applied server-side by `fuzzCoordinates` in both
 * `POST /api/auth/register` and `POST /api/auth/complete-profile`; what the
 * browser sends is the exact point tapped, and what lands in the column never
 * is.
 */

/** Leaflet dereferences `window` on import, so it can never be server-rendered. */
const LocationPicker = dynamic(
  () => import("@/components/location-picker").then((m) => m.LocationPicker),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 w-full animate-pulse rounded-2xl bg-slate-100 sm:h-96" />
    ),
  },
);

type HomeLocationFieldProps = {
  /** The chosen village, or null while none is selected. */
  village: { centerLat: number; centerLng: number; defaultZoom: number } | null;
  value: LocationValue | null;
  onChange: (value: LocationValue | null) => void;
  error?: string;
};

export function HomeLocationField({
  village,
  value,
  onChange,
  error,
}: HomeLocationFieldProps) {
  return (
    <div>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 ring-1 ring-brand-100">
          <MapPinHouse className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-700">
            Pin your approximate area{" "}
            <span className="font-normal text-slate-400">— optional</span>
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
            We shift this by up to ~{HOME_LOCATION_FUZZ_METERS}m before saving
            it, so what we store is never the point you tapped. It is used only
            to work out which incidents are near enough to be worth alerting you
            about, and it is never shown to anyone. Drop it on your street rather
            than your doorstep.
          </p>
        </div>
      </div>

      {village ? (
        <div className="mt-3">
          <LocationPicker
            value={value}
            onChange={onChange}
            center={{ lat: village.centerLat, lng: village.centerLng }}
            zoom={village.defaultZoom}
          />

          <div className="mt-2">
            {value ? (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-sm font-medium text-slate-500 underline underline-offset-2 transition hover:text-slate-700"
              >
                Remove pin
              </button>
            ) : (
              /*
                A Skip that is deliberately not a no-op control. There is nothing
                to clear — the field is already empty — so what it offers is the
                answer to the question a resident actually has at this point,
                which is whether leaving it blank will cost them anything.
              */
              <p className="text-sm text-slate-500">
                Rather not?{" "}
                <span className="font-medium text-slate-600">Skip this</span> —
                you will get alerts for the whole village instead.
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 rounded-lg bg-slate-50 px-3.5 py-3 text-sm text-slate-500 ring-1 ring-slate-200">
          Choose your village above and a map will appear here.
        </p>
      )}

      {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  );
}
