"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type L from "leaflet";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Layers,
  LocateFixed,
  MapPin,
  MapPinned,
  Radar,
  Shield,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { MapEvent, MapIncident, MapMode } from "@/components/incident-map";
import { FilterSheet } from "@/components/modern/filter-sheet";
import { IncidentSheet } from "@/components/modern/incident-sheet";
import { ListSheet } from "@/components/modern/list-sheet";
import { TrendsSheet } from "@/components/modern/trends-sheet";
import { untilForScrub } from "@/lib/map/trends";
import { MapKey } from "@/components/modern/map-key";
import { ReportFlow, type ReportGate } from "@/components/modern/report-flow";
import type { PrivacyLevel } from "@/lib/constants";
import { patternMembers } from "@/lib/map/pattern";
import {
  DEFAULT_MAP_FILTERS,
  activeFilterCount,
  applyMapFilters,
  periodDays,
  periodPhrase,
  summaryLine,
  type MapFilters,
} from "@/lib/map/filters";

/**
 * The map screen — the redesign's home.
 *
 * What `/map` renders, on every screen size. It replaced `MapView`, the map
 * with five floating controls that came before the redesign. It is the
 * handoff's mobile prototype: the
 * map full-bleed, and at rest only two things on top of it (design options 1d
 * and 1f) —
 *
 * - **The summary pill**, top left: the village, how many reports, over what
 *   period. Tapping it opens the filter sheet, because "what am I looking at?"
 *   and "change what I am looking at" are the same question.
 * - **The filter button** beside it, with a badge counting what is narrowed.
 * - **A two-button rail**, top right: layers (a popover of three switches —
 *   reports, heatmap, events) and locate.
 * - **The timeline chip**, under the pill and only while the timeline narrows
 *   the map: a dark pill with the date it runs to and a button to clear it.
 *
 * Everything else the old map floated over the tiles — five period pills,
 * the layer group, the legend — lives in the filter sheet.
 *
 * ## What it filters, and what it never widens
 *
 * The page sends published and resolved reports only (domain rule 6), scoped to
 * the session's village (domain rule 4). The filters here narrow that set in
 * the browser, the way the old period toggle did, and `applyMapFilters`
 * is the one function that does it — so the pill's count, the badge, the
 * footer button's "Show 18 reports" and the pins on the map cannot disagree.
 *
 * ## Locate
 *
 * Asks the browser for the device's position and recentres the map on it.
 * The position is used on the device and nowhere else: it is not sent, not
 * stored and not logged. A refusal or a timeout is a toast, not an error page.
 */

const IncidentMap = dynamic(
  () => import("@/components/incident-map").then((m) => m.IncidentMap),
  {
    ssr: false,
    loading: () => <div className="size-full animate-pulse bg-[#f2f0ec]" />,
  },
);

type Layers = { pins: boolean; heat: boolean; events: boolean };

const LAYER_OPTIONS = [
  { key: "pins", label: "Reports", icon: MapPin },
  { key: "heat", label: "Heatmap", icon: Radar },
  { key: "events", label: "Events", icon: CalendarDays },
] as const;

/** The design's card shadow — the pill, the filter button and the rail. */
const CARD_SHADOW =
  "shadow-[0_1px_2px_rgba(15,23,42,.08),0_6px_20px_rgba(15,23,42,.14)]";

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

export type MapScreenProps = {
  incidents: readonly MapIncident[];
  center: { lat: number; lng: number };
  zoom: number;
  villageName: string;
  /** Null when the village has events off — no Events layer at all, then. */
  events?: readonly MapEvent[] | null;
  /** Whether this village can take a report right now, and if not, why. */
  reportGate: ReportGate;
  privacyLevel: PrivacyLevel;
  canPostAlert: boolean;
  /**
   * Arrived with `?report=1` — the tab bar's Report button — so the report
   * flow opens over the map. See `ReportFlow`.
   */
  startReporting?: boolean;
  /**
   * The sheet this route opens over the map: `/incidents` is the List tab and
   * `/trends` the Trends tab, and on a phone each is this
   * screen with its sheet up. Closing it goes to `/map`.
   */
  initialSheet?: "list" | "trends";
};

export function MapScreen({
  incidents,
  center,
  zoom,
  villageName,
  events = null,
  reportGate,
  privacyLevel,
  canPostAlert,
  startReporting = false,
  initialSheet,
}: MapScreenProps) {
  const router = useRouter();
  const [sheet, setSheet] = useState<"list" | "trends" | null>(
    initialSheet ?? null,
  );

  /** Close the List or Trends sheet — and leave its route for the map's. */
  function closeSheet() {
    setSheet(null);
    if (initialSheet) router.replace("/map", { scroll: false });
  }
  const [reporting, setReporting] = useState(startReporting);

  // The Report tab is a link to `/map?report=1`, so pressing it while already
  // on the map changes the prop rather than mounting a new screen. Adjusted
  // during render against the previous value — React's pattern for state that
  // follows a prop — rather than in an effect, which would draw a frame of the
  // map without the sheet first.
  const [seenStart, setSeenStart] = useState(startReporting);
  if (startReporting !== seenStart) {
    setSeenStart(startReporting);
    if (startReporting) setReporting(true);
  }

  function stopReporting() {
    setReporting(false);
    // Drop `?report=1`, or a refresh would open the flow again.
    if (startReporting) router.replace("/map", { scroll: false });
  }

  // The clock, once: reading it during render is impure (the React Compiler
  // rejects it), and pinning it stops the period's cutoff sliding underneath
  // somebody sitting on the page.
  const [now] = useState(() => Date.now());
  const [filters, setFilters] = useState<MapFilters>(DEFAULT_MAP_FILTERS);
  const [layers, setLayers] = useState<Layers>({
    pins: true,
    heat: false,
    events: true,
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(false);
  /**
   * The timeline, as days back from today: reports after that day are hidden,
   * so dragging it back and forward replays the period. 0 is "up to today",
   * which is the map at rest. Set from the Trends sheet; the chip clears it.
   */
  const [scrub, setScrub] = useState(0);
  const until = untilForScrub(scrub, now);

  /** The incident whose sheet is open — a tapped pin. */
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const mapRef = useRef<L.Map | null>(null);
  const onReady = useCallback((map: L.Map) => {
    mapRef.current = map;
    // A tap on the map itself — not a pin, which Leaflet keeps to itself —
    // closes the sheet and the layers popover, as in the handoff.
    map.on("click", () => {
      setSelectedId(null);
      setLayersOpen(false);
    });
  }, []);

  const filtered = useMemo(
    () => applyMapFilters(incidents, filters, now),
    [incidents, filters, now],
  );

  const visible = useMemo(
    () =>
      until === null
        ? filtered
        : filtered.filter(
            (incident) => new Date(incident.occurredAt).getTime() <= until,
          ),
    [filtered, until],
  );

  /*
    The open sheet's incident, looked up in what is drawn rather than in
    everything sent: a filter that hides the selected report closes its sheet
    rather than leaving it describing a pin that is not there.
  */
  const selected = selectedId
    ? (visible.find((incident) => incident.id === selectedId) ?? null)
    : null;
  const pattern = selected?.recurring
    ? patternMembers(selected, visible)
    : [];

  /** Open a pin's sheet, and bring the pin into the part of the map above it. */
  function select(incident: MapIncident) {
    if (reporting) return;
    // A pin's sheet and the List / Trends sheet share the bottom of the
    // screen; the one just asked for wins.
    setSheet(null);
    setSelectedId(incident.id);
    setLayersOpen(false);
    const map = mapRef.current;
    if (!map) return;
    const at = map.latLngToContainerPoint([incident.lat, incident.lng]);
    const size = map.getSize();
    map.panBy([at.x - size.x / 2, at.y - size.y * 0.28], { animate: true });
  }

  /** Frame the pattern's reports above the sheet. */
  function showPattern() {
    const map = mapRef.current;
    if (!map || pattern.length < 2) return;
    map.fitBounds(
      pattern.map((incident) => [incident.lat, incident.lng] as [number, number]),
      {
        paddingTopLeft: [50, 100],
        paddingBottomRight: [50, Math.round(map.getSize().y * 0.55)],
        maxZoom: 17,
      },
    );
  }

  const filterCount = activeFilterCount(filters);
  const shownEvents = events && layers.events ? events : [];
  const mode: MapMode =
    layers.pins && layers.heat ? "both" : layers.heat ? "heat" : "pins";

  function openFilters() {
    setLayersOpen(false);
    setFiltersOpen(true);
  }

  function locate() {
    if (!("geolocation" in navigator)) {
      toast.error("This browser cannot share its location.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapRef.current?.setView(
          [position.coords.latitude, position.coords.longitude],
          16,
        );
      },
      () => {
        toast.error("Could not find your location. Check the browser's permission.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  }

  const layerOptions = LAYER_OPTIONS.filter(
    (option) => option.key !== "events" || events !== null,
  );

  return (
    <div className="map-surface vw-full-bleed vw-muted relative h-dvh w-full">
      <div className="pointer-events-none absolute inset-0 z-[800]">
        {/* The pill and the filter button — 1d. Hidden while reporting, when
            the top of the map is the placement banner's. */}
        {!reporting && (
        <>
        <div className="absolute top-[calc(12px+env(safe-area-inset-top))] right-3 left-3 flex gap-2">
          <button
            type="button"
            onClick={openFilters}
            aria-haspopup="dialog"
            className={`pointer-events-auto flex h-14 min-w-0 flex-1 items-center gap-2.5 rounded-2xl bg-white pr-3.5 pl-2.5 text-left ${CARD_SHADOW}`}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#0284c7]">
              <Shield className="size-5 text-white" strokeWidth={2.25} aria-hidden />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] font-[650] text-[#0f172a]">
                {villageName}
              </span>
              <span className="text-[12.5px] text-[#64748b]" aria-live="polite">
                {summaryLine(visible.length, filters.period)}
              </span>
            </span>
            <ChevronDown className="size-[18px] shrink-0 text-[#64748b]" aria-hidden />
          </button>

          <button
            type="button"
            onClick={openFilters}
            aria-label={
              filterCount > 0 ? `Filters, ${filterCount} on` : "Filters"
            }
            aria-haspopup="dialog"
            className={`pointer-events-auto relative grid size-14 shrink-0 place-items-center rounded-2xl bg-white ${CARD_SHADOW}`}
          >
            <SlidersHorizontal className="size-[21px] text-[#0f172a]" aria-hidden />
            {filterCount > 0 && (
              <span
                className="absolute top-[7px] right-[7px] h-[18px] min-w-[18px] rounded-[9px] bg-[#0284c7] px-[5px] text-center text-[11px] leading-[18px] font-bold text-white"
                aria-hidden
              >
                {filterCount}
              </span>
            )}
          </button>
        </div>

        {/* The two-button rail — layers and locate. */}
        <div
          className={`pointer-events-auto absolute top-[calc(80px+env(safe-area-inset-top))] right-3 flex flex-col overflow-hidden rounded-[14px] bg-white ${CARD_SHADOW}`}
        >
          <button
            type="button"
            onClick={() => setLayersOpen((open) => !open)}
            aria-label="Map layers"
            aria-expanded={layersOpen}
            aria-controls="map-layers"
            className={`grid size-12 place-items-center border-b border-[#f1f5f9] ${
              layersOpen ? "bg-[#f0f9ff]" : "bg-white"
            }`}
          >
            <Layers className="size-[21px] text-[#0f172a]" aria-hidden />
          </button>
          <button
            type="button"
            onClick={locate}
            aria-label="Centre on my location"
            className="grid size-12 place-items-center bg-white"
          >
            <LocateFixed className="size-[21px] text-[#0f172a]" aria-hidden />
          </button>
        </div>

        {layersOpen && (
          <div
            id="map-layers"
            className="pointer-events-auto absolute top-[calc(80px+env(safe-area-inset-top))] right-[68px] flex w-[196px] flex-col rounded-[14px] bg-white p-1.5 shadow-[0_8px_28px_rgba(15,23,42,.2)]"
          >
            <span className="px-2.5 pt-2 pb-1 font-mono text-[11px] font-semibold tracking-[.04em] text-[#64748b]">
              SHOW ON MAP
            </span>
            {layerOptions.map((option) => {
              const on = layers[option.key];
              const Icon = option.icon;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="switch"
                  aria-checked={on}
                  onClick={() =>
                    setLayers((current) => ({
                      ...current,
                      [option.key]: !current[option.key],
                    }))
                  }
                  className="flex h-11 items-center gap-2.5 rounded-[10px] px-2.5 text-left hover:bg-[#f8fafc]"
                >
                  <Icon className="size-[19px] text-[#334155]" aria-hidden />
                  <span className="flex-1 text-[14.5px] font-medium text-[#0f172a]">
                    {option.label}
                  </span>
                  <span
                    className={`grid size-5 place-items-center rounded-md border-[1.5px] ${
                      on
                        ? "border-[#0284c7] bg-[#0284c7]"
                        : "border-[#cbd5e1] bg-white"
                    }`}
                    aria-hidden
                  >
                    {on && <Check className="size-[13px] text-white" strokeWidth={3} />}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        </>
        )}

        <ReportFlow
          open={reporting}
          onClose={stopReporting}
          getMap={() => mapRef.current}
          gate={reportGate}
          privacyLevel={privacyLevel}
          canPostAlert={canPostAlert}
          onViewOnMap={(report) =>
            mapRef.current?.setView([report.lat, report.lng], 17)
          }
        />

        {/* The timeline chip — only while the timeline narrows the map. */}
        {until !== null && (
          <div className="pointer-events-auto absolute top-[calc(80px+env(safe-area-inset-top))] left-3 flex h-10 items-center gap-2 rounded-[20px] bg-[#0f172a] pr-1 pl-3.5 text-[13.5px] font-semibold text-white shadow-[0_6px_20px_rgba(15,23,42,.25)]">
            <Clock className="size-4" aria-hidden />
            <span aria-live="polite">Up to {DAY_LABEL.format(until)}</span>
            <button
              type="button"
              onClick={() => setScrub(0)}
              aria-label="Clear the timeline"
              className="grid size-8 place-items-center rounded-full bg-white/15 hover:bg-white/25"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>

      <IncidentMap
        incidents={layers.pins || layers.heat ? visible : []}
        center={center}
        zoom={zoom}
        now={now}
        mode={mode}
        label={`Map of reported incidents in ${villageName}`}
        fitToIncidents={filtered.length > 0}
        fitTo={filtered}
        events={shownEvents}
        onReady={onReady}
        pinStyle="glyph"
        onSelect={select}
        selectedId={selected?.id ?? null}
        // The List sheet and the tab bar under it cover about two thirds of a
        // phone, the Trends sheet about half; frame the pins above them. Off
        // the route's sheet, not the live one: the framing runs again whenever
        // this changes, and closing the list to open a pin must not re-frame
        // the map out from under the pin it just panned to.
        fitClearBottom={
          initialSheet === "list" ? 0.65 : initialSheet === "trends" ? 0.5 : 0
        }
        className="size-full"
      />

      {incidents.length === 0 && shownEvents.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[750] grid place-items-center p-6">
          <div className="pointer-events-auto max-w-sm rounded-2xl bg-white p-5 text-center shadow-xl ring-1 ring-slate-200">
            <span className="mx-auto grid size-11 place-items-center rounded-xl bg-[#f0f9ff] text-[#0284c7]">
              <MapPinned className="size-5" aria-hidden />
            </span>
            <h2 className="mt-3 text-base font-semibold text-[#0f172a]">
              Nothing on the map yet
            </h2>
            <p className="mt-1.5 text-sm leading-relaxed text-[#475569]">
              Reports appear here once a coordinator has reviewed them. Yours
              would be the first.
            </p>
          </div>
        </div>
      )}

      <ListSheet
        open={sheet === "list" && !reporting}
        onClose={closeSheet}
        incidents={visible}
        now={now}
        periodPhrase={periodPhrase(filters.period)}
        filterCount={filterCount}
        onOpenFilters={openFilters}
        onSelect={select}
      />

      <TrendsSheet
        open={sheet === "trends" && !reporting}
        onClose={closeSheet}
        incidents={filtered}
        period={filters.period}
        periodDays={periodDays(filters.period)}
        onPeriodChange={(period) => {
          setFilters((current) => ({ ...current, period }));
          setScrub(0);
        }}
        scrub={scrub}
        onScrubChange={setScrub}
        now={now}
      />

      <IncidentSheet
        incident={reporting ? null : selected}
        now={now}
        onClose={() => setSelectedId(null)}
        onShowPattern={showPattern}
        patternSize={pattern.length}
      />

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        filters={filters}
        onChange={(next) => {
          setFilters(next);
          // A new period is a new track: an end date from the old one would
          // hide reports the new period is meant to show.
          if (next.period !== filters.period) setScrub(0);
        }}
        resultCount={visible.length}
        legend={<MapKey />}
      />
    </div>
  );
}
