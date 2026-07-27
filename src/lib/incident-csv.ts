import type {
  IncidentStatus,
  IncidentType,
  Severity,
} from "@/generated/prisma/enums";
import {
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
} from "@/lib/constants";

/**
 * The coordinator's CSV export, as a pure function.
 *
 * Split out of `src/app/api/dashboard/export/route.ts` so the part with rules in
 * it can be exercised without a database, a session or a running server —
 * `scripts/check-incident-csv.ts` asserts against everything below. The route
 * keeps the parts that need a request: the auth gate, the query and the audit
 * row.
 *
 * Nothing here imports Prisma or touches a secret, and `ExportIncident` has no
 * field for `rawDescription`, `lat` or `lng` — the same structural guard
 * `AlertIncident` and `ReportIncident` use, and for the sharpest version of the
 * reason. A spreadsheet is emailed, forwarded and left on a shared drive; a
 * name or a registration in one is not recallable. See the note at the top of
 * the route.
 */

/** One row's worth of incident. Deliberately the anonymised columns only. */
export type ExportIncident = {
  reference: string;
  type: IncidentType;
  severity: Severity;
  status: IncidentStatus;
  /** The public, anonymised rewrite — never `rawDescription` (domain rule 1). */
  description: string;
  locationText: string | null;
  peopleCount: number | null;
  occurredAt: Date;
  tags: { label: string }[];
};

export const CSV_COLUMNS = [
  "date",
  "time",
  "reference",
  "type",
  "severity",
  "status",
  "location",
  "description",
  "people_count",
  "tags",
] as const;

const DATE = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/London",
});

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/London",
});

/**
 * Whether a cell would be read as a formula rather than as text.
 *
 * Excel, LibreOffice and Sheets all evaluate a cell whose value begins `=`, `+`,
 * `-` or `@`, and `=cmd|'/c calc'!A1` in a description field is a command
 * executed on the councillor's laptop rather than a sentence read off it.
 *
 * Two things this checks that the previous single regex did not:
 *
 * - **Leading whitespace does not launder the trigger.** Excel discards leading
 *   spaces when it parses a CSV cell, so `" =1+1"` arrives as `=1+1` and
 *   evaluates. A test anchored straight at the trigger character missed every
 *   payload with a space in front of it, which is the first thing anybody tries.
 *   `﻿` and ` ` are in the class for the same reason — a byte-order
 *   mark or a non-breaking space is invisible in the source text and stripped
 *   or ignored on the way in.
 * - **A newline start is a trigger in its own right.** `\t` and `\r` were
 *   already treated as one; `\n` was not, and there is no reason for the three
 *   to differ.
 */
export function isFormulaBait(text: string): boolean {
  return /^[\t\r\n]/.test(text) || /^[\s﻿ ]*[=+\-@]/.test(text);
}

/**
 * Escapes one CSV field.
 *
 * The leading apostrophe is not decoration and quoting is not a substitute for
 * it: Excel strips the surrounding quotes while parsing and *then* evaluates, so
 * `"=1+1"` is a formula and `"'=1+1"` is text. Both are applied — the quotes so
 * a description containing a comma or a line break stays in one field, the
 * apostrophe so it stays inert.
 */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  const text = String(value);
  const guarded = isFormulaBait(text) ? `'${text}` : text;

  return `"${guarded.replace(/"/g, '""')}"`;
}

/** One incident as its ten escaped fields, in `CSV_COLUMNS` order. */
function csvRow(row: ExportIncident): string {
  return [
    csvField(DATE.format(row.occurredAt)),
    csvField(TIME.format(row.occurredAt)),
    csvField(row.reference),
    csvField(INCIDENT_TYPE_LABELS[row.type]),
    csvField(SEVERITY_LABELS[row.severity]),
    csvField(INCIDENT_STATUS_LABELS[row.status]),
    csvField(row.locationText),
    csvField(row.description),
    csvField(row.peopleCount),
    csvField(row.tags.map((tag) => tag.label).join("; ")),
  ].join(",");
}

/**
 * The whole file, ready to be the response body.
 *
 * The leading BOM is what makes Excel open a UTF-8 CSV as UTF-8. Without it
 * every pound sign and curly apostrophe in a description arrives mojibaked, and
 * the whole point of this file is that somebody reads it in Excel. CRLF for the
 * same audience.
 */
export function buildIncidentCsv(rows: readonly ExportIncident[]): string {
  const lines = [CSV_COLUMNS.join(","), ...rows.map(csvRow)];

  return `﻿${lines.join("\r\n")}\r\n`;
}

export const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";

/** `villagewatch-incidents-2026-07-27.csv`. */
export function csvFilename(now: Date): string {
  return `villagewatch-incidents-${now.toISOString().slice(0, 10)}.csv`;
}
