"use client";

import { useState, useSyncExternalStore } from "react";
import { Clock, RotateCcw } from "lucide-react";
import {
  boundsKey,
  clampSelection,
  dayAt,
  fullSelection,
  isFullSelection,
  selectionLabel,
  type TimelineBounds,
  type TimelineSelection,
} from "@/lib/timeline";

/**
 * The timeline slider: a second filter, inside the period, over incidents the
 * browser already holds.
 *
 * Two surfaces use it. `/map` gets the two-handled version behind a clock
 * toggle in its top-right control group; the dashboard's density thumbnail
 * gets a single handle that scrubs the end of the period forward, so the heat
 * can be watched building up. The arithmetic is `src/lib/timeline.ts`.
 *
 * ## Two native range inputs, stacked
 *
 * Not a slider library. Two `<input type="range">` share one track: each is
 * keyboard-operable, announces its own value, and works with a finger on a
 * phone without any pointer handling here. The inputs themselves ignore
 * pointer events and only their thumbs accept them, which is what lets a press
 * on either handle reach the right input when they overlap the same track.
 * When both handles sit at the far right, the start handle is raised above the
 * end one — otherwise it would be buried under a handle that cannot move any
 * further right, and the selection could never be widened again.
 */

// ---------------------------------------------------------------------------
// Open or closed, remembered
// ---------------------------------------------------------------------------

/**
 * Whether the panel is expanded, in localStorage.
 *
 * The same store shape as the map's layer choice and the onboarding tour, for
 * their reasons: localStorage cannot be read during render, an effect that
 * reads it and calls `setState` is the cascading render React lints against,
 * and `useSyncExternalStore` has a server snapshot for exactly this. The server
 * snapshot is **closed**, which is also the default — so a resident who has
 * never opened it gets no re-render, and the mobile map stays clear.
 */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Fires in the other tabs only; `setTimelineOpen` notifies this one.
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readOpen(storageKey: string): boolean {
  try {
    return window.localStorage.getItem(storageKey) === "open";
  } catch {
    // Storage blocked. Closed is a working map.
    return false;
  }
}

function writeOpen(storageKey: string, open: boolean): void {
  try {
    window.localStorage.setItem(storageKey, open ? "open" : "closed");
  } catch {
    // Worst case the choice does not survive a reload.
  }

  for (const listener of listeners) listener();
}

/**
 * The panel's open state for one surface. The two surfaces keep separate keys:
 * wanting the slider on the full map says nothing about wanting it under a
 * dashboard thumbnail.
 */
export function useTimelineOpen(
  storageKey: string,
): [boolean, (open: boolean) => void] {
  const open = useSyncExternalStore(
    subscribe,
    () => readOpen(storageKey),
    () => false,
  );

  return [open, (next) => writeOpen(storageKey, next)];
}

// ---------------------------------------------------------------------------
// The selection, reset by a change of period
// ---------------------------------------------------------------------------

/**
 * The selected days, tied to the track they were chosen on.
 *
 * Stored beside `boundsKey`, and a stored key that no longer matches reads as
 * the whole track. That is the reset on a change of period, done during render
 * rather than in an effect — an effect would draw one frame of the old
 * offsets applied to the new period first, which on a map is a visible flash of
 * the wrong reports.
 */
export function useTimelineSelection(bounds: TimelineBounds): {
  selection: TimelineSelection;
  setSelection: (next: TimelineSelection) => void;
  narrowed: boolean;
} {
  const key = boundsKey(bounds);
  const [stored, setStored] = useState<{
    key: string;
    selection: TimelineSelection;
  } | null>(null);

  const selection =
    stored && stored.key === key ? stored.selection : fullSelection(bounds);

  return {
    selection,
    setSelection: (next) => setStored({ key, selection: next }),
    narrowed: !isFullSelection(bounds, selection),
  };
}

// ---------------------------------------------------------------------------
// The toggle
// ---------------------------------------------------------------------------

export function TimelineToggle({
  open,
  onToggle,
  controls,
  narrowed,
  className = "",
}: {
  open: boolean;
  onToggle: () => void;
  /** The panel's id, for `aria-controls`. */
  controls: string;
  /** Whether the slider is currently filtering anything out. */
  narrowed: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls={controls}
      aria-label={open ? "Hide timeline" : "Show timeline"}
      title={open ? "Hide timeline" : "Show timeline"}
      className={`relative inline-grid size-8 place-items-center rounded-lg transition ${
        open
          ? "bg-brand-600 text-white"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      } ${className}`}
    >
      <Clock className="size-4" aria-hidden />
      {/*
        A closed panel still filtering the map is a map showing less than the
        period control says. The dot is what stops that being invisible.
      */}
      {narrowed && !open && (
        <span
          className="absolute right-1 top-1 size-2 rounded-full bg-amber-500 ring-2 ring-white"
          aria-hidden
        />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// The slider
// ---------------------------------------------------------------------------

const ANNOUNCED = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

/**
 * One class string for both thumbs, in both engines. Written out rather than
 * built, because Tailwind only emits classes it can find as literals.
 */
const THUMB =
  "pointer-events-none absolute inset-0 h-full w-full cursor-pointer appearance-none bg-transparent focus-visible:outline-none " +
  "[&::-webkit-slider-runnable-track]:bg-transparent " +
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-brand-600 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow " +
  "focus-visible:[&::-webkit-slider-thumb]:ring-4 focus-visible:[&::-webkit-slider-thumb]:ring-brand-500/30 " +
  "[&::-moz-range-track]:bg-transparent " +
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-brand-600 [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow " +
  "focus-visible:[&::-moz-range-thumb]:ring-4 focus-visible:[&::-moz-range-thumb]:ring-brand-500/30 " +
  "disabled:cursor-not-allowed disabled:opacity-50";

export function TimelineSlider({
  id,
  bounds,
  selection,
  onChange,
  now,
  variant = "range",
  shown,
  total,
  className = "",
}: {
  id: string;
  bounds: TimelineBounds;
  selection: TimelineSelection;
  onChange: (next: TimelineSelection) => void;
  now: Date;
  /**
   * `range` is two handles. `end` is one, the end of the window, with the start
   * fixed at the first day — for the thumbnail, where scrubbing forward and
   * watching the heat build is the one thing worth doing in 200px.
   */
  variant?: "range" | "end";
  /** Reports inside the selection, and in the whole period, for the caption. */
  shown: number;
  total: number;
  className?: string;
}) {
  const max = bounds.days - 1;
  const single = max === 0;
  const narrowed = !isFullSelection(bounds, selection);

  const percent = (offset: number) => (max === 0 ? 0 : (offset / max) * 100);
  const from = variant === "end" ? 0 : selection.from;
  const to = selection.to;

  const move = (which: "from" | "to", value: number) =>
    onChange(
      clampSelection(
        bounds,
        which === "from" ? { from: value, to } : { from, to: value },
        which,
      ),
    );

  return (
    <div id={id} className={className}>
      <div className="flex items-baseline justify-between gap-3">
        {/*
          `aria-live` so a keyboard user hears the window change as they step a
          handle — the input announces its own day, and this is the pair.
        */}
        <p
          className="text-sm font-semibold tabular-nums text-slate-900"
          aria-live="polite"
        >
          {selectionLabel(bounds, { from, to }, now)}
        </p>
        {narrowed && (
          <button
            type="button"
            onClick={() => onChange(fullSelection(bounds))}
            className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"
          >
            <RotateCcw className="size-3" aria-hidden />
            Reset
          </button>
        )}
      </div>

      <p className="mt-0.5 text-[11px] text-slate-500">
        {single
          ? "This period is a single day."
          : narrowed
            ? `${shown} of ${total} ${total === 1 ? "report" : "reports"} in this period`
            : `All ${total} ${total === 1 ? "report" : "reports"} in this period`}
      </p>

      <div className="relative mt-3 h-5">
        {/* The track, and the stretch of it that is selected. */}
        <div className="absolute inset-x-2.5 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200">
          <div
            className="absolute inset-y-0 rounded-full bg-brand-500"
            style={{
              left: `${percent(from)}%`,
              width: `${percent(to) - percent(from)}%`,
            }}
          />
        </div>

        {variant === "range" && (
          <input
            type="range"
            min={0}
            max={max}
            step={1}
            value={from}
            disabled={single}
            onChange={(event) => move("from", Number(event.target.value))}
            aria-label="Start date"
            aria-valuetext={ANNOUNCED.format(dayAt(bounds.start, from))}
            className={`${THUMB} ${from >= max ? "z-20" : "z-10"}`}
          />
        )}

        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={to}
          disabled={single}
          onChange={(event) => move("to", Number(event.target.value))}
          aria-label={variant === "end" ? "Show reports up to" : "End date"}
          aria-valuetext={ANNOUNCED.format(dayAt(bounds.start, to))}
          className={`${THUMB} z-10`}
        />
      </div>
    </div>
  );
}
