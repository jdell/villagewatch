import { dateInputValue } from "@/lib/date-range";

/**
 * The arithmetic behind a month grid, and the label above a date range.
 *
 * **Client-safe** — same import budget as `format-alert.ts`, `date-range.ts` and
 * `community-report.ts`: nothing here touches Prisma, a secret or `node:*`. It
 * is drawn by `src/components/reports/report-period-picker.tsx`, which is a
 * Client Component, and it is a separate module so the parts with an off-by-one
 * in them can be tested without rendering a calendar.
 *
 * ## Everything here is the host zone, deliberately
 *
 * A cell is a *day*, not an instant. Every date is built with `new Date(y, m, d)`
 * — local midnight — and rendered back with `dateInputValue`, which formats in
 * the host zone for the reason its own comment gives: it is the exact inverse of
 * `new Date("yyyy-mm-ddT00:00:00")`, which is how `resolveReportRange` parses
 * what this picker submits. Formatting a cell in `Europe/London` instead would
 * be a round trip that does not close — on a UTC host, local midnight is 01:00
 * British Summer Time, and the grid would highlight a day either side of the one
 * that was clicked.
 *
 * The one exception is the chip's own text, which nothing parses back. It uses
 * the host zone too, but only so that what a coordinator reads on the chip is
 * the day they clicked in the grid above it.
 */

/** Monday first — British calendars start the week there. */
export const WEEKDAYS = [
  { short: "Mo", long: "Monday" },
  { short: "Tu", long: "Tuesday" },
  { short: "We", long: "Wednesday" },
  { short: "Th", long: "Thursday" },
  { short: "Fr", long: "Friday" },
  { short: "Sa", long: "Saturday" },
  { short: "Su", long: "Sunday" },
] as const;

/**
 * `yyyy-mm-dd` to local midnight, or null for anything that is not a date.
 *
 * The two guards are not the same check. The regex refuses a string that is not
 * shaped like a date at all; re-reading the parts off the parsed value is what
 * catches one that is shaped right and does not exist — `2026-02-30` rolls
 * forward to 2 March rather than failing, and a picker that silently opened on
 * a different month than the URL asked for would look like a bug in the form.
 */
export function parseDateValue(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : null;
}

/** The same `yyyy-mm-dd` the form submits and the resolver parses back. */
export const toDateValue = dateInputValue;

/** Midnight on the first of the month the date falls in. */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * The first of the month `months` away.
 *
 * Anchored to the first rather than to the day passed in, which is what keeps
 * the picker's two-month window from skipping February: `new Date(2026, 0, 31)`
 * plus one month is 3 March, because day 31 does not exist in the month it
 * lands in. Every caller here wants a month, not a day in one.
 */
export function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

/** "August 2026", for the heading above one month's grid. */
export function monthLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(date);
}

/** True when both are the same calendar day in the host zone. */
export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * One month as weeks of seven, Monday first. `null` is a cell with no day in it.
 *
 * The leading gap is `(weekday + 6) % 7` rather than `weekday - 1`, because
 * `getDay()` returns 0 for Sunday and a Sunday would otherwise take -1 cells and
 * shift the whole month left by one.
 *
 * Only the weeks the month actually occupies are returned — four for a February
 * that starts on a Monday, six for a 31-day month that starts on a Sunday. A
 * fixed six-row grid would leave an empty row under most months and make the two
 * halves of the picker different heights depending on what they landed on.
 */
export function monthGrid(month: Date): (Date | null)[][] {
  const first = startOfMonth(month);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from(
      { length: days },
      (_, index) => new Date(first.getFullYear(), first.getMonth(), index + 1),
    ),
  ];

  while (cells.length % 7 !== 0) cells.push(null);

  return Array.from({ length: cells.length / 7 }, (_, week) =>
    cells.slice(week * 7, week * 7 + 7),
  );
}

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/**
 * "22 Jul – 21 Aug", the label on the chip that opens the picker.
 *
 * The year is carried only where it says something. Both ends get one when the
 * range straddles New Year, since "22 Dec – 21 Jan" is two different reports and
 * nothing on the chip would say which; one end gets it when the range is wholly
 * inside a year that is not this one; and a range inside the current year gets
 * neither, because a coordinator building this month's report does not need to
 * be told what year it is.
 *
 * A single day renders as one date rather than "22 Jul – 22 Jul".
 */
export function formatRangeChip(
  from: Date,
  to: Date,
  now: Date = new Date(),
): string {
  const sameYear = from.getFullYear() === to.getFullYear();
  const thisYear = sameYear && from.getFullYear() === now.getFullYear();

  if (!sameYear) {
    return `${DAY_MONTH_YEAR.format(from)} – ${DAY_MONTH_YEAR.format(to)}`;
  }

  const format = thisYear ? DAY_MONTH : DAY_MONTH_YEAR;

  return isSameDay(from, to)
    ? format.format(from)
    : `${DAY_MONTH.format(from)} – ${format.format(to)}`;
}
