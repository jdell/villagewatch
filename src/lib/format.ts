/**
 * Display formatting. British English throughout — see the product-language
 * note in CLAUDE.md.
 *
 * No runtime dependency on Prisma or Supabase, so this is safe to import from
 * both Server and Client Components.
 */

const RELATIVE = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });

const UNITS = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: "week", ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
] as const satisfies readonly { unit: Intl.RelativeTimeFormatUnit; ms: number }[];

export function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * "12 minutes ago", "3 days ago", "just now".
 *
 * Rendered server-side this is a snapshot of the moment the HTML was built, so
 * anything using it should sit inside a `<time>` element carrying the real
 * timestamp and suppress the hydration mismatch — see `IncidentCard`.
 */
export function formatTimeAgo(
  value: Date | string | number,
  now: Date = new Date(),
): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";

  const deltaMs = date.getTime() - now.getTime();
  const magnitude = Math.abs(deltaMs);

  if (magnitude < 45_000) return "just now";

  for (const { unit, ms } of UNITS) {
    if (magnitude >= ms) {
      return RELATIVE.format(Math.round(deltaMs / ms), unit);
    }
  }

  return RELATIVE.format(Math.round(deltaMs / 1000), "second");
}

const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/London",
});

/** "24 Jul 2026, 15:04" — the exact time, for tooltips and detail views. */
export function formatDateTime(value: Date | string | number): string {
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? "" : DATE_TIME.format(date);
}

const DATE_ONLY = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "long",
  timeZone: "Europe/London",
});

/**
 * "24 July 2026" — a day with no time on it.
 *
 * `dateStyle: "long"` rather than the `medium` used above, because the two
 * places this renders are the head of a document that goes to a police officer
 * or a parish clerk and the date-range picker that produced it. An abbreviated
 * month is right in a card and wrong in a heading somebody prints.
 */
export function formatDate(value: Date | string | number): string {
  const date = toDate(value);
  return Number.isNaN(date.getTime()) ? "" : DATE_ONLY.format(date);
}

/**
 * Value for a `datetime-local` input, in the browser's own zone. Cannot use
 * `toISOString()` — that returns UTC, which silently shifts the time the
 * reporter sees by an hour through British summer time.
 */
export function toDateTimeLocalValue(value: Date | string | number): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return "";

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

/** Rounds a coordinate for display. Six decimals is ~10cm — far too precise. */
export function formatCoordinates(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}
