"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Flame, MapPinned } from "lucide-react";
import type { MapIncident, MapMode } from "@/components/incident-map";
import {
  BROWSE_RANGE_VALUES,
  DEFAULT_TIME_RANGE,
  SEVERITIES,
  TIME_RANGES,
  type TimeRangePreset,
} from "@/lib/constants";
import { resolveTimeRange, withinTimeRange } from "@/lib/date-range";
import { HEATMAP_LEGEND_CSS } from "@/lib/heatmap";

/**
 * The full-screen map, plus the controls that sit on top of it.
 *
 * This component exists to own three things the map itself should not: the
 * `next/dynamic` call, which is only legal from a Client Component because
 * Leaflet touches `window` on import; the date range, which is a filter over
 * data already in the browser rather than another round trip; and the layer
 * choice below. The server sends the village's incidents once, so narrowing to
 * seven days or switching to density is instant — which is the difference
 * between a control people use and one they do not.
 *
 * The heat layer reads the *filtered* set, so the date range applies to both
 * layers. A density map of "all time" and a pin set of "last 7 days" on the same
 * screen would be two different claims about the same village.
 */

const IncidentMap = dynamic(
  () => import("@/components/incident-map").then((m) => m.IncidentMap),
  {
    ssr: false,
    loading: () => <div className="size-full animate-pulse bg-slate-200" />,
  },
);

/**
 * The periods offered, from the one list all three surfaces read.
 *
 * `custom` is in it, and on this screen it is the only control that reveals
 * anything: choosing it opens two date inputs, and because the filtering happens
 * over incidents already in the browser, changing either one redraws both layers
 * without a round trip.
 */
const RANGES = TIME_RANGES.filter((range) =>
  (BROWSE_RANGE_VALUES as readonly string[]).includes(range.value),
);

const MODES = [
  { value: "pins", label: "Pins" },
  { value: "heat", label: "Heatmap" },
  { value: "both", label: "Both" },
] as const satisfies readonly { value: MapMode; label: string }[];

// ---------------------------------------------------------------------------
// Which layer, remembered
// ---------------------------------------------------------------------------

/**
 * The chosen layer, in localStorage.
 *
 * Same shape as the onboarding tour's store and for the same reasons:
 * localStorage cannot be read during render, reading it in an effect and calling
 * `setState` is the cascading render React lints against, and
 * `useSyncExternalStore` has a server snapshot for exactly this. The server
 * snapshot is `pins`, which is both the default and the existing behaviour — so
 * a resident who has never touched the control gets no re-render, and one who
 * chose the heatmap last week gets it on the pass after hydration rather than
 * after a flash of the wrong map.
 *
 * Device-local on purpose. This is a way of looking at the map, not a setting
 * about the village, and it costs nothing to be wrong about on a new device.
 */
const STORAGE_KEY = "villagewatch:map-mode";

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Fires in the *other* tabs, so a resident with the map open twice does not
  // have two of them disagreeing.
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function isMode(value: string | null): value is MapMode {
  return value === "pins" || value === "heat" || value === "both";
}

function storedMode(): MapMode {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return isMode(value) ? value : "pins";
  } catch {
    // Private browsing with storage blocked. The default is a working map.
    return "pins";
  }
}

/** No localStorage on the server, so it renders the default. */
function defaultMode(): MapMode {
  return "pins";
}

function rememberMode(mode: MapMode): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Worst case the choice does not survive a reload.
  }

  // `storage` does not fire in the tab that made the change.
  for (const listener of listeners) listener();
}

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
  const [preset, setPreset] = useState<TimeRangePreset>(DEFAULT_TIME_RANGE);

  // No `setState` behind this: the store *is* localStorage, and writing to it
  // notifies every subscriber including this one.
  const mode = useSyncExternalStore(subscribe, storedMode, defaultMode);

  /**
   * The clock, read once when the view mounts.
   *
   * A lazy `useState` initialiser rather than a bare `Date.now()` in the body:
   * reading the clock during render is impure and the React Compiler rejects
   * it, and pinning it here also stops the seven-day cutoff sliding underneath
   * the user while they sit on the page.
   */
  const [now] = useState(() => Date.now());

  /**
   * What the two date inputs hold, seeded with the default window.
   *
   * Seeded rather than empty so that pressing "Custom range" shows a month of
   * reports and a pair of dates to adjust, instead of an empty map and two
   * blank fields — the state somebody would read as the filter being broken.
   */
  const [custom, setCustom] = useState(() => {
    const seed = resolveTimeRange({}, { now: new Date(now) });
    return { from: seed.fromValue, to: seed.toValue };
  });

  const range = useMemo(
    () =>
      resolveTimeRange(
        { range: preset, from: custom.from, to: custom.to },
        { now: new Date(now) },
      ),
    [preset, custom.from, custom.to, now],
  );

  const visible = useMemo(
    () =>
      incidents.filter((incident) =>
        withinTimeRange(incident.occurredAt, range),
      ),
    [incidents, range],
  );

  const showPins = mode !== "heat";
  const showHeat = mode !== "pins";

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
    // have to keep matching, the safe-area inset that bar now adds to its own
    // height included. Subtract one without the other and the map is taller
    // than the space beneath the header, which is the scroll this line exists
    // to prevent.
    <div className="map-surface relative h-[calc(100dvh-3.5rem-env(safe-area-inset-top))] w-full lg:h-dvh">
      <IncidentMap
        incidents={visible}
        center={center}
        zoom={zoom}
        now={now}
        mode={mode}
        // Framing the pins beats the village's stored viewport once there is
        // anything to frame, and re-frames when the range changes. It applies to
        // the heat layer too — the blobs are drawn from the same set.
        fitToIncidents={visible.length > 0}
        className="size-full"
      />

      {/*
        z-index sits above Leaflet's own panes, which top out at 700 — and below
        its controls, which are at 1000. That ordering is why the zoom buttons
        are no longer in the corner this card is in: `incident-map.tsx` asks for
        `bottomright`, because a control at 1000 over an overlay at 800 means the
        overlay is what loses, and what a resident was left reading was two zoom
        buttons on top of their village's name.
      */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[800] flex flex-wrap items-start justify-between gap-3 p-3 sm:p-4">
        {/*
          This card keeps its natural width on a phone without being told to:
          the control group beside it is wider than the viewport, so `flex-wrap`
          on the parent moves the whole group to the next row rather than
          squeezing the two of them onto one. Flexbox breaks a line before it
          shrinks anything on it, which is why there is no `shrink-0` here —
          measured at 375, 390 and 720, it changes nothing.
        */}
        <div className="pointer-events-auto rounded-xl bg-white/95 px-3.5 py-2.5 shadow-lg ring-1 ring-slate-200 backdrop-blur">
          <p className="text-sm font-semibold text-slate-900">{villageName}</p>
          <p className="mt-0.5 text-xs text-slate-500">
            {visible.length === 0
              ? "Nothing reported in this period"
              : `${visible.length} ${visible.length === 1 ? "incident" : "incidents"}`}
          </p>
        </div>

        <div className="pointer-events-none flex flex-wrap items-start justify-end gap-2">
          <div
            className="pointer-events-auto inline-flex flex-wrap justify-end rounded-xl bg-white/95 p-1 shadow-lg ring-1 ring-slate-200 backdrop-blur"
            role="group"
            aria-label="Map layer"
          >
            {MODES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => rememberMode(option.value)}
                aria-pressed={mode === option.value}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  mode === option.value
                    ? "bg-brand-600 text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="pointer-events-none flex flex-col items-end gap-2">
            {/*
              Wrapping, because the four periods want 367px and an iPhone in
              portrait has 366px of row — one pixel over on the widest of them
              and sixteen on a 375px phone. Nothing ran off the screen: flexbox
              squeezed the pills instead, which broke a label in half inside its
              own button, so a resident chose between "Last 30" over "days" and
              "Custom" over "range". Wrapping puts each period on one line and
              spends a row of the map instead. The layer group above wraps for
              the same reason rather than because it has ever needed to.
            */}
            <div
              className="pointer-events-auto inline-flex flex-wrap justify-end rounded-xl bg-white/95 p-1 shadow-lg ring-1 ring-slate-200 backdrop-blur"
              role="group"
              aria-label="Date range"
            >
              {RANGES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPreset(option.value)}
                  aria-pressed={preset === option.value}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    preset === option.value
                      ? "bg-brand-600 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/*
              Only while Custom is chosen. Every other control on this screen is
              always present; this one is a pair of inputs that mean nothing
              under a preset, and leaving them on screen would invite somebody to
              fill them in and wonder why the map did not move.
            */}
            {preset === "custom" && (
              <div className="pointer-events-auto rounded-xl bg-white/95 p-3 shadow-lg ring-1 ring-slate-200 backdrop-blur">
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label
                      htmlFor="map-range-from"
                      className="block text-[11px] font-medium text-slate-500"
                    >
                      From
                    </label>
                    <input
                      id="map-range-from"
                      type="date"
                      value={custom.from}
                      max={custom.to}
                      onChange={(event) =>
                        setCustom((current) => ({
                          ...current,
                          from: event.target.value,
                        }))
                      }
                      className="mt-1 block h-9 rounded-lg border border-slate-300 px-2.5 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="map-range-to"
                      className="block text-[11px] font-medium text-slate-500"
                    >
                      To
                    </label>
                    <input
                      id="map-range-to"
                      type="date"
                      value={custom.to}
                      onChange={(event) =>
                        setCustom((current) => ({
                          ...current,
                          to: event.target.value,
                        }))
                      }
                      className="mt-1 block h-9 rounded-lg border border-slate-300 px-2.5 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    />
                  </div>
                </div>

                {/*
                  There is no Apply button: the filter runs over incidents
                  already in the browser, so the map follows the inputs as they
                  change. `notice` is where an adjustment the resolver made —
                  swapped dates, an end date in the future — is admitted.
                */}
                <p className="mt-2 max-w-56 text-[11px] leading-relaxed text-slate-500">
                  {range.notice ?? "Both dates are included."}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/*
        The legend follows the layers rather than sitting there regardless: a
        severity key beside a map with no pins on it explains nothing, and a heat
        scale beside a map with no heat is worse — it invites somebody to read
        pin colours as density.

        The right padding is the zoom control's column, kept clear. Leaflet's
        buttons are 34px wide with a 10px margin, and this row is centred until
        `sm` — so the width that bites is the one wide enough to sit both cards
        on one line and too narrow to left-align them. Measured at 500px: the
        density card's right edge landed seven pixels inside the buttons, and
        clears them by fifteen with this. Written per side rather than as `p-3`
        plus a `pr-` override, because the shorthand and the directional utility
        are two properties and which one wins inside a breakpoint is a question
        about Tailwind's output order rather than about this file.

        The bottom padding is the attribution's row, and clearing it is older
        than this change — a 17px strip at the very bottom that the density card
        has always covered the top few pixels of when the layers wrap onto two
        rows. It is a licence condition rather than a control, so it gets the
        20px it needs while the padding beside it is being written out anyway.
      */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[800] flex flex-wrap justify-center gap-2 pb-5 pl-3 pr-14 pt-3 sm:justify-start sm:pl-4 sm:pr-16 sm:pt-4">
        {showPins && (
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
        )}

        {showHeat && (
          <div className="pointer-events-auto rounded-xl bg-white/95 px-3.5 py-2.5 shadow-lg ring-1 ring-slate-200 backdrop-blur">
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Flame className="size-3.5 text-slate-400" aria-hidden />
              Density
            </p>
            <div
              className="mt-1.5 h-2 w-32 rounded-full"
              style={{ background: HEATMAP_LEGEND_CSS }}
              aria-hidden
            />
            <div className="mt-1 flex justify-between text-[11px] text-slate-500">
              <span>Quieter</span>
              <span>Busier</span>
            </div>
          </div>
        )}
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
