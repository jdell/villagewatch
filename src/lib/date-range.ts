import {
  BROWSE_RANGE_VALUES,
  DASHBOARD_RANGE_VALUES,
  DEFAULT_TIME_RANGE,
  MAX_CUSTOM_RANGE_DAYS,
  TIME_RANGES,
  type TimeRangePreset,
} from "@/lib/constants";
import { timeRangeSchema } from "@/lib/validations";

/**
 * The period the map, the incident list and the dashboard are looking at.
 *
 * **Client-safe, and that is load-bearing.** The map filters incidents already
 * in the browser — the server sends the village's reports once, so narrowing to
 * a custom range is instant rather than another round trip — while the list and
 * the dashboard resolve the same query string on the server and push it into
 * the SQL. One resolver for both, so "1 June to 14 June" cannot mean one thing
 * on the map and another in the list beside it. Same import budget as
 * `format-alert.ts` and `community-report.ts`: `constants.ts`, `validations.ts`,
 * and nothing that touches Prisma or a secret.
 *
 * ## Nothing here rejects
 *
 * Every branch has a defined outcome, for the reason `resolveReportRange` gives:
 * this runs on a page render, and a stale bookmark or a hand-edited query string
 * should produce the default period with a line explaining the adjustment rather
 * than an error page in front of somebody looking at a map. `notice` is how an
 * adjustment is admitted rather than silently applied.
 *
 * ## The boundaries are the server's midnight, not London's
 *
 * `new Date()` on a bare `yyyy-mm-ddThh:mm:ss` parses in the host zone, which is
 * UTC on Vercel, while the inputs are rendered in `Europe/London`. Through
 * British summer time that is an hour of skew at each end. Left alone
 * deliberately, and for the same reason `/reports` leaves it alone: correcting
 * it means carrying a zone database to move a boundary by an hour on a window
 * of a week or more. Worth knowing before somebody reconciles a custom range
 * against the CSV export, which counts on the same basis.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

export type TimeRange = {
  preset: TimeRangePreset;
  /**
   * `null` at either end means unbounded, which only `all` produces. A caller
   * building a Prisma filter should omit the bound rather than substitute one —
   * see `timeRangeFilter`.
   */
  from: Date | null;
  to: Date | null;
  /** Whole days covered, `null` when unbounded. Drives the comparison period. */
  days: number | null;
  /** `yyyy-mm-dd`, for the two date inputs to render back. */
  fromValue: string;
  toValue: string;
  /** Short label for a heading — "Last 30 days", or the dates themselves. */
  label: string;
  /** Set when a submitted range was adjusted, so the form can say so. */
  notice: string | null;
};

/** `yyyy-mm-dd` in the village's own zone, which is the one on the inputs. */
export function dateInputValue(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/London",
  }).format(date);
}

/** Whole days between two instants, rounded up. A single day is 1, never 0. */
function spanDays(from: Date, to: Date): number {
  return Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY_MS));
}

function presetDays(value: TimeRangePreset): number | null {
  return TIME_RANGES.find((range) => range.value === value)?.days ?? null;
}

function presetLabel(value: TimeRangePreset): string {
  return TIME_RANGES.find((range) => range.value === value)?.label ?? "";
}

/** "1 Jun – 14 Jun 2026", for a custom range's heading. */
function customLabel(from: Date, to: Date): string {
  const format = (date: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Europe/London",
    }).format(date);

  return `${format(from)} – ${format(to)}`;
}

export type ResolveOptions = {
  /**
   * The presets this surface actually renders. A range outside the list falls
   * back to the default rather than being honoured — the alternative is a
   * control showing "Last 30 days" over data covering ninety, which is a screen
   * lying about what is on it.
   */
  allowed?: readonly TimeRangePreset[];
  fallback?: TimeRangePreset;
  now?: Date;
};

/**
 * Turns a query string into a period.
 *
 * A custom range is inclusive of both days picked — `to` is pushed to the end of
 * that day. Somebody asking for the 1st to the 7th means seven days, and a naive
 * midnight boundary would give them six and a bit while dropping every report
 * filed on the last afternoon.
 */
export function resolveTimeRange(
  params: Record<string, string | string[] | undefined>,
  options: ResolveOptions = {},
): TimeRange {
  const {
    allowed = BROWSE_RANGE_VALUES,
    fallback = DEFAULT_TIME_RANGE,
    now = new Date(),
  } = options;

  const single = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const parsed = timeRangeSchema.parse({
    range: single(params.range),
    from: single(params.from),
    to: single(params.to),
  });

  // A preset this surface does not offer is treated as absent. `fallback` is
  // itself checked against the list, so a caller cannot default to a control
  // that is not on screen either.
  const requested = allowed.includes(parsed.range) ? parsed.range : null;
  const safeFallback = allowed.includes(fallback) ? fallback : allowed[0];
  const preset = requested ?? safeFallback;

  /** The window the date inputs show when the range itself does not set them. */
  const suggestedDays = presetDays(safeFallback) ?? 30;

  if (preset === "all") {
    const suggestedFrom = new Date(now.getTime() - suggestedDays * DAY_MS);

    return {
      preset,
      from: null,
      to: null,
      days: null,
      // Unbounded has no dates of its own, so the inputs are seeded with the
      // default window. Switching to Custom then opens on something sensible
      // rather than on two empty fields.
      fromValue: dateInputValue(suggestedFrom),
      toValue: dateInputValue(now),
      label: presetLabel(preset),
      notice: null,
    };
  }

  const days = presetDays(preset);

  if (days !== null) {
    const from = new Date(now.getTime() - days * DAY_MS);

    return {
      preset,
      from,
      to: now,
      days,
      fromValue: dateInputValue(from),
      toValue: dateInputValue(now),
      label: presetLabel(preset),
      notice: null,
    };
  }

  // Custom. Either date missing falls back to the default window rather than
  // half a range — a `from` with no `to` is a form somebody is still filling in.
  const fromParsed = parsed.from ? new Date(`${parsed.from}T00:00:00`) : null;
  const toParsed = parsed.to ? new Date(`${parsed.to}T23:59:59.999`) : null;

  if (
    !fromParsed ||
    !toParsed ||
    Number.isNaN(fromParsed.getTime()) ||
    Number.isNaN(toParsed.getTime())
  ) {
    const from = new Date(now.getTime() - suggestedDays * DAY_MS);

    return {
      preset: "custom",
      from,
      to: now,
      days: suggestedDays,
      fromValue: dateInputValue(from),
      toValue: dateInputValue(now),
      label: customLabel(from, now),
      notice:
        parsed.from || parsed.to ? "Pick both a start and an end date." : null,
    };
  }

  let from = fromParsed;
  let to = toParsed;
  let notice: string | null = null;

  if (from > to) {
    // Swapped rather than refused. It is unambiguous what was meant, and an
    // error message for a mistake the app can fix is one nobody thanks you for.
    [from, to] = [to, from];
    notice = "The dates were the wrong way round, so they have been swapped.";
  }

  if (to > now) {
    to = now;
    notice ??= "The end date is in the future, so this runs to today.";
  }

  if (to.getTime() - from.getTime() > MAX_CUSTOM_RANGE_DAYS * DAY_MS) {
    from = new Date(to.getTime() - MAX_CUSTOM_RANGE_DAYS * DAY_MS);
    notice = `A range covers at most ${MAX_CUSTOM_RANGE_DAYS} days, so the start date has been moved.`;
  }

  return {
    preset: "custom",
    from,
    to,
    days: spanDays(from, to),
    fromValue: dateInputValue(from),
    toValue: dateInputValue(to),
    label: customLabel(from, to),
    notice,
  };
}

/** The dashboard's own list, so its default is `30` out of four presets. */
export function resolveDashboardRange(
  params: Record<string, string | string[] | undefined>,
  now?: Date,
): TimeRange {
  return resolveTimeRange(params, { allowed: DASHBOARD_RANGE_VALUES, now });
}

// ---------------------------------------------------------------------------
// Using one
// ---------------------------------------------------------------------------

/**
 * The `occurredAt` clause for a Prisma `where`.
 *
 * Spread into the filter rather than assigned, so an unbounded range
 * contributes **no key at all**. Passing `{ gte: undefined }` would work today
 * and is one Prisma release away from meaning something; an absent bound should
 * be absent.
 */
export function timeRangeFilter(
  range: TimeRange,
): { occurredAt?: { gte?: Date; lte?: Date } } {
  if (!range.from && !range.to) return {};

  return {
    occurredAt: {
      ...(range.from ? { gte: range.from } : {}),
      ...(range.to ? { lte: range.to } : {}),
    },
  };
}

/**
 * The same length of period, ending where this one starts.
 *
 * `null` for an unbounded range: there is nothing before all time to compare
 * against, and a trend arrow drawn from a comparison that cannot exist is worse
 * than no arrow. The dashboard does not offer `all` for this reason, but the
 * function is honest about it rather than assuming the caller checked.
 */
export function previousPeriod(
  range: TimeRange,
): { gte: Date; lt: Date } | null {
  if (!range.from || range.days === null) return null;

  return {
    gte: new Date(range.from.getTime() - range.days * DAY_MS),
    lt: range.from,
  };
}

/** Whether an instant falls inside the range. The map's client-side filter. */
export function withinTimeRange(value: string | Date, range: TimeRange): boolean {
  const time = (value instanceof Date ? value : new Date(value)).getTime();

  if (Number.isNaN(time)) return true;
  if (range.from && time < range.from.getTime()) return false;
  if (range.to && time > range.to.getTime()) return false;

  return true;
}

/**
 * The query string that reproduces a range, for a `Link`.
 *
 * The two dates ride along only for a custom range. Carrying them on a preset
 * would put a stale pair in every shared URL, and the next person to switch to
 * Custom would land on somebody else's fortnight.
 */
export function timeRangeParams(range: TimeRange): Record<string, string> {
  if (range.preset !== "custom") return { range: range.preset };

  return { range: "custom", from: range.fromValue, to: range.toValue };
}
