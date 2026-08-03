/**
 * The human-facing reference on every report — `VW-HIS-2026-0003`.
 *
 * Read as: VillageWatch, Histon, 2026, the third report Histon filed that year.
 * The number is the village's own and it resets on 1 January, which is the
 * whole point of this module. References used to be a single platform-wide
 * sequence (`VW-2026-0184`), so the first report a new parish ever filed was
 * numbered by how busy every other parish had been — a number a coordinator
 * cannot explain to a resident, and one that leaks the size of the deployment
 * to anybody holding two references from different villages.
 *
 * **Client-safe, and deliberately so** — the same import budget as
 * `format-alert.ts`, `community-report.ts` and `date-range.ts`: nothing here
 * touches Prisma, `node:crypto` or a secret. The format is defined once and
 * rendered from wherever it is needed.
 *
 * ## The format is built here and stored, not derived on read
 *
 * `Incident.reference` holds the finished string. That is the one identity a
 * report has: it is written into the audit trail, printed at the top of a
 * police summary, pasted into a WhatsApp Channel and read out on the phone.
 * Deriving it at render time would mean threading a village name through every
 * card, popup, CSV row and email — and any surface that forgot would print a
 * different reference for the same report. So this function is called once,
 * when the row is created, and everything downstream renders the column.
 *
 * What the columns behind it buy is the sequence itself: `villageIncidentNumber`
 * is what `MAX(...) + 1` reads and what the composite unique key on `incidents`
 * constrains, and neither is possible against a formatted string.
 */

/** The prefix every reference carries, whatever the village. */
export const REFERENCE_PREFIX = "VW";

/** How many letters of the village name make up the code. */
export const VILLAGE_CODE_LENGTH = 3;

/**
 * Where a village name yields no letters at all.
 *
 * Not reachable from the ONS directory — every parish in it has a name — but
 * `Village.name` is a free-text column and an empty code would produce
 * `VW--2026-0003`, which reads as a bug in the reference rather than a gap in
 * the data.
 */
export const FALLBACK_VILLAGE_CODE = "VIL";

/** Digits the sequence number is padded to. 0003, not 3. */
const NUMBER_DIGITS = 4;

/**
 * The three letters in the middle of a reference.
 *
 * `Village.villageCode` when a village has been given one by hand, and the
 * first three letters of its name otherwise. Non-letters are dropped before
 * the slice, so "St Neots" is `STN` rather than `ST` with a space in it, and
 * "A' Chrìon Làraich" is `ACH`.
 *
 * **The derivation is not unique and is not treated as though it were.** Every
 * "Great Ashfield" and "Great Barton" derives `GRE`; there are 10,670 parishes
 * in the directory and three letters cannot separate them. That costs nothing
 * in the database — references are unique *per village* (see the composite key
 * on `Incident`), so two villages numbering their own reports 0001 is correct
 * — and it costs a police officer covering both something real, which is what
 * `villageCode` is the answer to.
 *
 * The ASCII-letter class is what the backfill migration matches in SQL. Keep
 * the two the same or a rebuilt reference stops agreeing with a stored one.
 */
export function villageReferenceCode(village: {
  name?: string | null;
  villageCode?: string | null;
}): string {
  const set = village.villageCode?.trim();
  if (set) return set.toUpperCase();

  const letters = (village.name ?? "").replace(/[^A-Za-z]/g, "");

  return letters ? letters.slice(0, VILLAGE_CODE_LENGTH).toUpperCase() : FALLBACK_VILLAGE_CODE;
}

/**
 * `VW-HIS-2026-0003` for a village and one of its reports.
 *
 * Falls back to the report's stored `reference` when it has no number of its
 * own — every row filed before this scheme existed, and any row written by a
 * path that does not allocate one. That fallback is why this can be called
 * from a read path without checking first: it returns the reference the report
 * has always had rather than a half-built string with `undefined` in it.
 *
 * A number with no year (or the other way round) is treated the same way. Both
 * columns are written together by the create path, so one without the other is
 * a row somebody edited by hand, and the stored string is the better answer.
 */
export function formatIncidentReference(
  village: { name?: string | null; villageCode?: string | null } | null | undefined,
  incident: {
    reference?: string | null;
    referenceYear?: number | null;
    villageIncidentNumber?: number | null;
  },
): string {
  const { referenceYear, villageIncidentNumber } = incident;

  if (
    !village ||
    typeof referenceYear !== "number" ||
    typeof villageIncidentNumber !== "number"
  ) {
    return incident.reference ?? "";
  }

  return buildIncidentReference({
    villageCode: villageReferenceCode(village),
    year: referenceYear,
    number: villageIncidentNumber,
  });
}

/**
 * The format itself, for the create path — which has the code and the number
 * in hand and no incident row to fall back to yet.
 */
export function buildIncidentReference(input: {
  villageCode: string;
  year: number;
  number: number;
}): string {
  const number = String(input.number).padStart(NUMBER_DIGITS, "0");

  return `${REFERENCE_PREFIX}-${input.villageCode}-${input.year}-${number}`;
}
