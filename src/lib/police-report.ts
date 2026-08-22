import { formatPoliceMonth } from "@/lib/constants";

/**
 * The official police figures, in the shape every surface renders them from.
 *
 * **Safe to import from a Client Component**, and for the same reason
 * `format-alert.ts` and `community-report.ts` are: `constants.ts` and nothing
 * else. No Prisma, no `node:crypto`, no secret. That is load-bearing rather
 * than tidy — the community safety report is assembled in the browser once the
 * narrative comes back from a server action, so the police section has to be
 * buildable there too or the copied document and the screen would be two
 * different documents.
 *
 * `src/lib/police-data.ts` is the half that reads the database and produces a
 * `PoliceComparison`; `src/lib/police-api.ts` is the half that fetches it. This
 * module is the types and the words.
 *
 * ## The one rule the words follow
 *
 * A police figure and a VillageWatch figure are two measurements of the same
 * place, not the same measurement twice. They differ in **area** (the API
 * searches a one-mile radius of the village centre, not the parish boundary),
 * in **definition** (recorded crime after an officer's decision, against what a
 * resident thought they saw at the time) and in **period** (the Home Office
 * publishes about two months in arrears, so the recent weeks of any period are
 * simply not in it).
 *
 * `POLICE_COMPARISON_NOTE` carries all three, and it travels with the figures
 * everywhere they are rendered — the dashboard, the report on screen, the
 * report on the clipboard and the report as a PDF. It is one constant for the
 * reason `GENERATED_BY` and `AI_ANALYSIS_NOTE` are: four copies of a caveat is
 * four caveats the day somebody edits one.
 */

/** One police category and how many of it there were. */
export type PoliceCategoryCount = {
  /** The API's slug — `vehicle-crime`. Stored, and stable. */
  category: string;
  /** What to call it on screen. */
  label: string;
  count: number;
};

/**
 * The official figures for the calendar months a period overlaps.
 *
 * `months` is what this deployment actually holds and `missingMonths` is what it
 * does not, and both are rendered. That pair is the whole honesty mechanism:
 * without it a report covering July and August, of which only July has been
 * published, would print one month's crime figures under two months' worth of
 * VillageWatch reports and say nothing about the difference.
 */
export type PoliceComparison = {
  /** `YYYY-MM`, oldest first. Months the police answered for. */
  months: readonly string[];
  /**
   * Months of the period with no published figures held — either not yet
   * released, or a fetch that has not succeeded. Never rendered as a zero.
   */
  missingMonths: readonly string[];
  /** Recorded crimes across `months`, within the API's own search radius. */
  total: number;
  byCategory: readonly PoliceCategoryCount[];
  /**
   * VillageWatch's own published reports over **exactly the same whole months**.
   *
   * Not the report's own `total`, which covers the requested period. Two
   * numbers side by side have to be measured over the same span or the
   * comparison is arithmetic about nothing.
   */
  villageReports: number;
  /** The force slug, when the neighbourhood has been resolved. */
  force: string | null;
  forceName: string | null;
  neighbourhood: string | null;
  /** Newest month held, `YYYY-MM`. */
  latestMonth: string | null;
  /** When these figures were last read from data.police.uk. ISO. */
  fetchedAt: string | null;
};

/** One officer or PCSO, as the force publishes them. Never a `bio`. */
export type PoliceTeamMember = {
  name: string;
  rank: string | null;
  email: string | null;
};

/** The policing neighbourhood a village sits in, and who covers it. */
export type PoliceTeam = {
  force: string;
  forceName: string | null;
  neighbourhoodId: string;
  name: string;
  description: string | null;
  url: string | null;
  email: string | null;
  telephone: string | null;
  twitter: string | null;
  facebook: string | null;
  members: readonly PoliceTeamMember[];
  fetchedAt: string;
};

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/**
 * The months held, as a person reads them.
 *
 * "July 2026", "July and August 2026", "May 2026 to August 2026". Three shapes
 * rather than a list, because a report covering a year would otherwise print
 * twelve month names in a sentence nobody finishes.
 */
export function policeMonthsLabel(months: readonly string[]): string {
  if (months.length === 0) return "no months";
  if (months.length === 1) return formatPoliceMonth(months[0]);

  if (months.length === 2) {
    return `${formatPoliceMonth(months[0])} and ${formatPoliceMonth(months[1])}`;
  }

  return `${formatPoliceMonth(months[0])} to ${formatPoliceMonth(months[months.length - 1])}`;
}

/**
 * The sentence about what is not there, or null when everything is.
 *
 * Returned rather than rendered so each surface can place it — but the wording
 * is here, once, because it is the sentence that stops the figures being read
 * as a complete picture of the period. It names the publication lag as the
 * usual cause without asserting it is the only one: a month can also be missing
 * because a fetch has not succeeded, and a report should not tell a police
 * officer why their own data is late.
 */
export function policeMissingMonthsNote(
  comparison: Pick<PoliceComparison, "missingMonths">,
): string | null {
  const missing = comparison.missingMonths;

  if (missing.length === 0) return null;

  return `No official figures are held yet for ${policeMonthsLabel(missing)}. Police data is published about two months after the month it covers, so the most recent part of this period is not included in the figures above.`;
}

/**
 * "Cambridgeshire Constabulary, Histon and Impington" — where the figures came
 * from, or null when the neighbourhood has not been resolved.
 *
 * Null rather than a placeholder. A source line naming nobody is worse than no
 * source line: this is the one section of the report whose figures are somebody
 * else's, and the reader is entitled to know exactly whose.
 */
export function policeSourceLabel(
  comparison: Pick<PoliceComparison, "forceName" | "force" | "neighbourhood">,
): string | null {
  const force = comparison.forceName ?? comparison.force;

  if (!force && !comparison.neighbourhood) return null;
  if (!comparison.neighbourhood) return force;
  if (!force) return comparison.neighbourhood;

  return `${force} — ${comparison.neighbourhood}`;
}
