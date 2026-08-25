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

/**
 * The first letter of the first two words of a name — "PR" for Pat Resident.
 *
 * Here rather than beside either of the two components that draw it. The queue
 * card is rendered from a Server Component and the resident list is a Client
 * Component, so a helper living in either would be imported across the
 * boundary: a plain function exported from a `"use client"` module and called
 * on the server is a client reference, and calling one throws at render.
 *
 * One implementation because two would be two answers for the same resident on
 * two screens. Falls back to a dash rather than an empty string — a chip with
 * nothing in it reads as a loading state, and an anonymous report has no name
 * to take initials from.
 */
export function initialsOf(name: string | null | undefined): string {
  if (!name) return "–";

  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    // Spread rather than `[0]`, so a name starting with an astral character
    // gives that character back rather than half of a surrogate pair.
    .map((word) => [...word][0] ?? "")
    .join("");

  return letters.toUpperCase() || "–";
}

/**
 * The fixed stand-in for a masked local part.
 *
 * Fixed width on purpose. `j***@gmail.com` for `jane@` and for
 * `jane.elizabeth.smith@` alike — a mask that grew with the name would leak its
 * length, which for a village of a few hundred people is a real narrowing.
 */
const EMAIL_MASK = "***";

/**
 * An email address with its local part masked — `j***@gmail.com`.
 *
 * The resident list shows this and reveals the full address on request. What it
 * is for is **incidental** exposure rather than access control: a coordinator
 * screen-sharing the settings tab at a parish meeting, a screenshot pasted into
 * a WhatsApp group, somebody reading over a shoulder on a train. The full
 * address is a deliberate act away for a coordinator who needs it — a data
 * subject request, or emailing somebody about their report — and the reveal is
 * a server action, so the unmasked addresses are not sitting in the page for a
 * screenshot to catch either.
 *
 * The domain is kept whole and deliberately. It is not personal data on its own
 * — `gmail.com` describes nobody — and it is the half a coordinator actually
 * scans for, because "did they sign up with their work address or their home
 * one" is the question behind most glances at this column.
 *
 * **It fails closed.** Anything this cannot parse as an address returns the bare
 * mask rather than the input: a value that reached here without an `@` is
 * already surprising, and echoing it back on the grounds that it did not look
 * like an email is how an unmasked address ends up on screen.
 */
export function maskEmail(email: string | null | undefined): string {
  const trimmed = email?.trim() ?? "";

  // The *last* `@`, not the first. A quoted local part may legally contain one
  // (`"a@b"@example.test`), and splitting on the first would treat half the
  // local part as the domain — printing more of it than the mask hides.
  const at = trimmed.lastIndexOf("@");

  // No `@`, nothing before it to take an initial from, or nothing after it to
  // keep. All three fail to the bare mask.
  if (at <= 0 || at === trimmed.length - 1) return EMAIL_MASK;

  // Spread rather than `[0]`, so an address whose local part starts with an
  // astral character gives that character back rather than half of a surrogate
  // pair — which renders as a replacement glyph and identifies nobody.
  const initial = [...trimmed.slice(0, at)][0] ?? "";

  return `${initial}${EMAIL_MASK}${trimmed.slice(at)}`;
}
