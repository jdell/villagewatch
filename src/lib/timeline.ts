import { formatRangeChip } from "@/lib/calendar";

/**
 * The arithmetic behind the map's timeline slider.
 *
 * **Client-safe**, and a module rather than lines in the component for the
 * reason `calendar.ts` is one: the parts with an off-by-one in them can be
 * tested without rendering a slider. Same import budget — nothing that touches
 * Prisma, a secret or `node:*`.
 *
 * ## What the slider is a filter *of*
 *
 * The period control decides which reports are on the map; the slider narrows
 * within that, over incidents already in the browser. So the slider's track is
 * the period's own days, and a slider at its full extent is exactly the period
 * — which is what makes "no slider selection" and "the whole track" the same
 * state rather than two that happen to agree.
 *
 * ## Days, in the host zone
 *
 * A position on the track is a whole day, and every day is built with
 * `new Date(y, m, d + i)` — local midnight — rather than by adding multiples of
 * 24 hours to a timestamp. The two differ twice a year: across the clocks going
 * back, `start + 24h × i` lands at 23:00 the previous evening, and the report
 * filed at half past eleven that night is counted on the wrong side of the
 * handle. Same host-zone reasoning `calendar.ts` documents for its grid.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** The period the slider runs across, in whole days. */
export type TimelineBounds = {
  /** Local midnight of the first day on the track. */
  start: Date;
  /** How many days the track holds — at least 1. */
  days: number;
};

/** A selection on the track, as day offsets from `start`, both inclusive. */
export type TimelineSelection = {
  from: number;
  to: number;
};

/** Local midnight on the day `date` falls in. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Local midnight `offset` days after `start` — calendar days, not 24h steps. */
export function dayAt(start: Date, offset: number): Date {
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + offset);
}

/**
 * Whole calendar days from `a` to `b`, both taken at local midnight.
 *
 * Rounded rather than floored because a day that contains a clock change is
 * 23 or 25 hours long, and flooring a 23-hour day counts it as none.
 */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

/**
 * The track for a period.
 *
 * A bounded period runs from its first day to its last. `all` has no start,
 * so the track begins on the day of the earliest report — the only honest
 * start for "all time" is the first thing that happened in it — and with no
 * reports at all it is a single day, today. An end in the future is pulled
 * back to today: a track whose last stretch can never hold a report is a
 * handle nobody can drag to anything.
 */
export function timelineBounds(
  period: { from: Date | null; to: Date | null },
  occurredAt: readonly string[],
  now: Date,
): TimelineBounds {
  const today = startOfDay(now);

  let first: Date | null = period.from ? startOfDay(period.from) : null;
  if (!first) {
    let earliest = Infinity;
    for (const value of occurredAt) {
      const time = new Date(value).getTime();
      if (!Number.isNaN(time) && time < earliest) earliest = time;
    }
    first = Number.isFinite(earliest) ? startOfDay(new Date(earliest)) : today;
  }

  let last = period.to ? startOfDay(period.to) : today;
  if (last > today) last = today;
  if (first > last) first = last;

  return { start: first, days: daysBetween(first, last) + 1 };
}

/** The whole track selected — the state that filters nothing out. */
export function fullSelection(bounds: TimelineBounds): TimelineSelection {
  return { from: 0, to: bounds.days - 1 };
}

/** Whether a selection covers the whole track, i.e. narrows nothing. */
export function isFullSelection(
  bounds: TimelineBounds,
  selection: TimelineSelection,
): boolean {
  return selection.from <= 0 && selection.to >= bounds.days - 1;
}

/**
 * Clamp a selection to the track and keep the handles in order.
 *
 * Two range inputs cannot enforce `from <= to` between themselves, so a handle
 * dragged past the other is stopped at it rather than swapped — swapping would
 * move the *other* handle under a finger that was not touching it.
 */
export function clampSelection(
  bounds: TimelineBounds,
  selection: TimelineSelection,
  moved: "from" | "to" = "from",
): TimelineSelection {
  const max = bounds.days - 1;
  let from = Math.min(Math.max(Math.round(selection.from), 0), max);
  let to = Math.min(Math.max(Math.round(selection.to), 0), max);

  if (from > to) {
    if (moved === "from") from = to;
    else to = from;
  }

  return { from, to };
}

/**
 * A predicate for "occurred inside the selected days".
 *
 * The lower bound is inclusive at the first day's midnight and the upper bound
 * is **exclusive** at the midnight *after* the last day, so a report at
 * 23:59 on the last day is in and one at 00:00 the next day is out, with no
 * `.999` arithmetic. Anything unparseable is kept, matching `withinTimeRange`:
 * a filter should not be how a malformed row goes missing.
 */
export function withinSelection(
  bounds: TimelineBounds,
  selection: TimelineSelection,
): (occurredAt: string) => boolean {
  const lower = dayAt(bounds.start, selection.from).getTime();
  const upper = dayAt(bounds.start, selection.to + 1).getTime();

  return (occurredAt) => {
    const time = new Date(occurredAt).getTime();
    if (Number.isNaN(time)) return true;
    return time >= lower && time < upper;
  };
}

/** "15 Sep – 22 Sep" for a selection — the `/reports` chip's own format. */
export function selectionLabel(
  bounds: TimelineBounds,
  selection: TimelineSelection,
  now: Date,
): string {
  return formatRangeChip(
    dayAt(bounds.start, selection.from),
    dayAt(bounds.start, selection.to),
    now,
  );
}

/**
 * A key that changes whenever the track does.
 *
 * The slider's selection is only meaningful against the track it was made on;
 * choosing another period gives a different track, and offsets from the old
 * one would select an arbitrary stretch of the new one. The component stores
 * the key beside the selection and treats a mismatch as "whole track", which
 * resets on a period change without an effect.
 */
export function boundsKey(bounds: TimelineBounds): string {
  return `${bounds.start.getTime()}:${bounds.days}`;
}
