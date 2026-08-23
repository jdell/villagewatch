import type { IncidentType, Severity } from "@/generated/prisma/enums";
import {
  APP_NAME,
  DATA_CONTROLLER,
  INCIDENT_TYPE_LABELS,
  POLICE_ATTRIBUTION,
  POLICE_COMPARISON_NOTE,
  REPORT_DESCRIPTION_MAX_CHARS,
  SEVERITY_LABELS,
} from "@/lib/constants";
import type { PoliceComparison } from "@/lib/police-report";
import {
  policeMissingMonthsNote,
  policeMonthsLabel,
  policeSourceLabel,
} from "@/lib/police-report";
import { appBaseUrl, truncateWords } from "@/lib/format-alert";
import { formatDate, formatDateTime } from "@/lib/format";
import type { VoteTally } from "@/lib/votes";

/**
 * The written record a coordinator hands to a PCSO or a parish clerk.
 *
 * Two documents, one module: `formatIncidentSummary` is a single report, and
 * `formatCommunityReport` is everything published over a period. They share a
 * house style deliberately — an officer who has read one should not have to
 * work out the shape of the other — and they share the rule about what may be
 * in them, which is the part that matters.
 *
 * **Safe to import from a Client Component**, and for the same reason
 * `format-alert.ts` is: `constants.ts` (Prisma types only), `format.ts` (Intl)
 * and `format-alert.ts`. No Prisma client, no `node:crypto`, no secret. That is
 * load-bearing rather than tidy — the period report's narrative arrives in the
 * browser from a server action, so the final text has to be assembled *there*,
 * where the copy, print and share buttons are.
 *
 * ## What may be in these
 *
 * The same structural guard `AlertIncident` and `IncidentEmailInput` use, and
 * for a sharper reason than either: this text is handed to the operating
 * system's share sheet, and from there it goes wherever the coordinator taps —
 * an email to a named officer, or a group chat with forty people in it. The app
 * cannot see which. So `ReportIncident` has **no field that could carry
 * `rawDescription`, `lat` or `lng`**, and there is nowhere in the formatters
 * below to put one.
 *
 * `description` is the anonymised public column, already on the village map for
 * every resident. Where the AI pass did not run it is the reporter's own
 * wording — `anonymized` is the column that says which, and the two screens
 * that render these say so in red when it is false.
 *
 * ## Why there are no coordinates, when "map link" was asked for
 *
 * The link is the report's own page on this deployment, which needs a signed-in
 * resident of the village to open. That is deliberate. A coordinate pair in a
 * document that reaches a group chat is not recallable, and the pin it would
 * describe was jittered on the way in (domain rule 2) — so it is precise enough
 * to point at a house and not precise enough to be correct about which one. The
 * location a police officer can act on is `locationText`, the landmark a
 * resident typed, and that is what these carry.
 *
 * ## Why the single-incident summary is not audited
 *
 * `navigator.share()` has to be called inside the user gesture that triggered
 * it — an `await` in front of it spends the gesture and iOS Safari refuses the
 * call (see `src/lib/clipboard.ts`). An audit write before the sheet opens is
 * therefore a share button that does not work on a phone, which is the device
 * this feature is for. What is left is a coordinator formatting one report they
 * are already looking at, carrying only what every resident of the village can
 * already read. The period report has no such constraint and *is* audited:
 * `incident.report_generated`.
 */

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** One incident, as either document needs it. Never `rawDescription`. */
export type ReportIncident = {
  id: string;
  reference: string;
  type: IncidentType;
  severity: Severity;
  title: string;
  /** The anonymised public column. */
  description: string;
  locationText: string | null;
  occurredAt: Date | string | number;
  reportedAt: Date | string | number;
  recurring: boolean;
  patternNote: string | null;
  /** False means `description` is the reporter's own words, never rewritten. */
  anonymized: boolean;
  /** Whether the reporter said they had already been to the police. */
  reportedToPolice?: boolean;
  policeReference?: string | null;
};

export type IncidentSummaryInput = {
  incident: ReportIncident;
  villageName: string;
  /** `Village.parishCouncil`, falling back to the deployment-wide constant. */
  dataController: string;
};

/** One row of a breakdown, already counted. */
export type ReportCount<K extends string> = { key: K; count: number };

export type ReportHotspot = { location: string; count: number };

/**
 * One report the village itself flagged up, and by how much.
 *
 * The severity on a report is the reporter's own assessment. This is the
 * village's, and in a document going to a police officer that distinction has
 * to survive — which is why the section carries both counts rather than a net
 * score, and why the words around it say who did the counting.
 *
 * No voter is named. There is no field here that could carry one.
 */
export type ReportConcern = {
  reference: string;
  title: string;
  type: IncidentType;
  severity: Severity;
  locationText: string | null;
  votes: VoteTally;
};

/**
 * The narrative, and where it came from.
 *
 * `source` is on the document rather than in a comment: a summary written by a
 * model and a summary assembled from counts read very differently to somebody
 * deciding whether to act on it, and the footer says which one they have.
 */
export type ReportNarrative = {
  summary: string;
  patterns: readonly string[];
  recommendation: string | null;
  source: "ai" | "counted";
  model: string | null;
};

export type CommunityReportData = {
  villageName: string;
  dataController: string;
  from: Date | string | number;
  to: Date | string | number;
  generatedAt: Date | string | number;
  /** Published incidents in the range. */
  total: number;
  /** The same length of period immediately before it, for the trend line. */
  previousTotal: number;
  byType: readonly ReportCount<IncidentType>[];
  bySeverity: readonly ReportCount<Severity>[];
  hotspots: readonly ReportHotspot[];
  /**
   * Reports the village rated more serious than they look, most first.
   *
   * **Empty omits the section**, the same rule `police` follows and for a
   * related reason: a heading reading "Most concerning" over nothing, in a
   * document addressed to a PCSO, reads as a section that failed rather than as
   * a village nobody has voted in. A deployment where the buttons have never
   * been pressed produces exactly the report it produced before this existed.
   *
   * Bounded by `CONCERN_LIST_SIZE` and filtered by `MIN_VOTES_TO_FEATURE` — see
   * `src/lib/votes.ts`. One neighbour nudging a report is not the village
   * saying anything, and a document that presented it as such would be putting
   * a claim in a village's mouth.
   */
  mostConcerning: readonly ReportConcern[];
  /**
   * The Home Office's own recorded-crime figures for the months this period
   * overlaps, or null when this deployment holds none for the village.
   *
   * **Null omits the section entirely**, rather than rendering it empty. A
   * heading reading "Police recorded crime" over a zero, in a document a
   * coordinator sends to a PCSO, is a claim about the officer's own figures
   * that VillageWatch is in no position to make — and it is a claim made
   * silently, by a `count(*)` that is individually correct. See
   * `src/lib/police-report.ts`.
   */
  police: PoliceComparison | null;
  /** Null until the coordinator asks for one. The rest of the report stands. */
  narrative: ReportNarrative | null;
  /** Newest first, capped at `REPORT_MAX_INCIDENTS`. */
  incidents: readonly ReportIncident[];
  /** Rows the cap left out of the log. Stated in the document, never hidden. */
  omitted: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The one heading both documents wear, so an officer recognises the second. */
const DOCUMENT_TITLE = "COMMUNITY SAFETY REPORT";

const RULE = "─".repeat(52);

/**
 * Absolute link to a path on this deployment.
 *
 * A malformed `NEXT_PUBLIC_APP_URL` costs a relative link rather than a throw
 * inside a render — the same call `format-alert.ts` makes, for the same reason.
 */
function appUrlFor(path: string, appUrl: string): string {
  try {
    return new URL(path, appUrl).toString();
  } catch {
    return path;
  }
}

/** `Village.parishCouncil` if it is set, the deployment constant if not. */
export function reportController(parishCouncil: string | null): string {
  return parishCouncil?.trim() || DATA_CONTROLLER.name;
}

/**
 * Whether this document's own prose was written by a model.
 *
 * **Not** whether AI touched the underlying reports — it did, in every case:
 * `description` is the anonymised rewrite. This is narrower, and the narrowness
 * is the point. `Generated by VillageWatch AI` was printed on every document
 * this module produces, including the ones whose only prose is
 * `countedNarrative` — a paragraph assembled from `SELECT count(*)` — and the
 * single-incident summary, which has no analysis section at all and is a
 * formatting of one report a coordinator is already looking at.
 *
 * A police officer reading "Generated by AI" at the foot of a document decides
 * how much of it to trust on that line. Printing it over counted figures
 * invites them to discount arithmetic; printing it where a model did write the
 * analysis is what they are entitled to know. `narrative.source` already
 * carries the distinction for exactly this reason — this is the footer catching
 * up with it.
 */
export const GENERATED_BY = `Generated by ${APP_NAME}.`;

/**
 * The sentence that may only follow `GENERATED_BY` over prose a model wrote.
 *
 * Exported because three surfaces render this footer — the clipboard text
 * below, `report-view.tsx` on screen and `report-pdf.tsx` in the file — and
 * they have to say the same thing. Three copies of a sentence is three
 * sentences the day somebody edits one.
 */
export const AI_ANALYSIS_NOTE =
  "The pattern analysis in it was written by AI.";

/**
 * The sentence that has to travel with the "most concerning" section.
 *
 * Same job `POLICE_COMPARISON_NOTE` does one section further down, and the same
 * reason for existing: a ranked list in a document addressed to a police
 * officer looks like an assessment, and this one is a show of hands. It says
 * who did the counting, that it is not a severity, and that it is not a count
 * of separate incidents — because the obvious misreading of "7 residents rated
 * this more serious" is "seven people saw it".
 *
 * Exported because three surfaces render this section — the clipboard text
 * below, `report-view.tsx` on screen and `report-pdf.tsx` in the file — and
 * three copies of a sentence is three sentences the day somebody edits one.
 */
export const CONCERN_NOTE =
  "Residents of this village can mark a published report as more or less " +
  "serious than it appears. These are those votes, not a severity assessment " +
  "and not a count of witnesses — one vote is one resident's opinion of one " +
  "report. Votes are anonymous and nobody is named.";

function generatedBy(aiWritten: boolean): string {
  return aiWritten
    ? `${GENERATED_BY} ${AI_ANALYSIS_NOTE}`
    : GENERATED_BY;
}

/**
 * The closing block, identical on both documents bar the first line.
 *
 * It is not decoration. A recipient outside the village has no other way to
 * know that the descriptions were rewritten, that the locations are landmarks
 * rather than addresses, or who to go to under UK GDPR — and a summary that
 * reads like a police log without saying any of that invites an officer to
 * treat an approximate area as an address.
 */
function footer(dataController: string, aiWritten: boolean): string[] {
  return [
    RULE,
    `${generatedBy(aiWritten)} Data controller: ${dataController}.`,
    "Descriptions are anonymised before publication — personal details, names and",
    "registrations are removed. Locations are the landmark a resident named, not an",
    "address, and mapped positions are deliberately offset. Reports are what",
    "residents said they saw; they are not verified crime records.",
  ];
}

/** "Vehicle crime            4" — a label column and a right-aligned count. */
function countLines(rows: readonly { label: string; count: number }[]): string[] {
  if (rows.length === 0) return ["  (none)"];

  const width = Math.max(...rows.map((row) => row.label.length));

  return rows.map((row) => `  ${row.label.padEnd(width)}  ${row.count}`);
}

/** "3 more than the 9 in the previous 7 days", or the honest absence of one. */
function trendLine(total: number, previous: number, days: number): string {
  const period = `previous ${days} day${days === 1 ? "" : "s"}`;

  if (previous === 0) {
    return `There is no comparable figure for the ${period}.`;
  }

  const change = total - previous;

  if (change === 0) {
    return `The ${period} saw the same number, ${previous}.`;
  }

  return `The ${period} saw ${previous} — ${Math.abs(change)} ${
    change > 0 ? "fewer" : "more"
  } than this period.`;
}

/**
 * The police comparison, as lines of the plain-text document.
 *
 * Beside `countLines` rather than in `police-report.ts` because it is built out
 * of this module's own house style — the label column, the rule, the widths —
 * and a version living elsewhere would have to be handed those, which is a
 * seam that exists only to move code out of a file. What *is* in
 * `police-report.ts` is everything the three rendered surfaces also need: the
 * types, the month label, the missing-months sentence and the source line.
 *
 * Both branches carry `POLICE_COMPARISON_NOTE`. A section that printed the
 * figures without it would be two numbers in a police document with nothing
 * saying they were measured over different areas, on different definitions, in
 * different months.
 */
function policeLines(police: PoliceComparison): string[] {
  const lines: string[] = [];
  const source = policeSourceLabel(police);

  if (police.months.length === 0) {
    lines.push(
      "No official police figures are held for this period yet. Police data is",
      "published about two months after the month it covers.",
    );

    if (source) lines.push("", `Neighbourhood: ${source}`);
    lines.push("", POLICE_ATTRIBUTION);

    return lines;
  }

  lines.push(
    `Covering ${policeMonthsLabel(police.months)}, as published by the police.`,
    "",
    ...countLines([
      { label: "Police recorded crimes", count: police.total },
      { label: "VillageWatch reports", count: police.villageReports },
    ]),
  );

  if (police.byCategory.length > 0) {
    lines.push(
      "",
      "By police category",
      ...countLines(
        police.byCategory.map((row) => ({ label: row.label, count: row.count })),
      ),
    );
  }

  const missing = policeMissingMonthsNote(police);
  if (missing) lines.push("", missing);

  if (source) lines.push("", `Neighbourhood: ${source}`);

  lines.push("", POLICE_COMPARISON_NOTE, "", POLICE_ATTRIBUTION);

  return lines;
}

/** Whole days between two instants, rounded up. Never zero. */
export function rangeDays(
  from: Date | string | number,
  to: Date | string | number,
): number {
  const ms = new Date(to).getTime() - new Date(from).getTime();
  return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)));
}

// ---------------------------------------------------------------------------
// One incident
// ---------------------------------------------------------------------------

/**
 * A single report, formatted for a PCSO or a parish clerk.
 *
 * ```
 * COMMUNITY SAFETY REPORT — VillageWatch
 * Little Barford
 *
 * Reference:  VW-4K2P9M
 * Category:   Vehicle crime
 * Severity:   High
 * Occurred:   21 Jul 2026, 02:30
 * Reported:   21 Jul 2026, 07:14
 * Location:   The lay-by on Mill Road (approximate)
 * ...
 * ```
 *
 * A label column rather than prose, because the first thing a recipient does
 * with this is copy the reference and the time into their own system.
 */
export function formatIncidentSummary(
  input: IncidentSummaryInput,
  appUrl: string = appBaseUrl(),
): string {
  const { incident } = input;

  const fields: [string, string][] = [
    ["Reference", incident.reference],
    ["Category", INCIDENT_TYPE_LABELS[incident.type]],
    ["Severity", SEVERITY_LABELS[incident.severity]],
    ["Occurred", formatDateTime(incident.occurredAt)],
    ["Reported", formatDateTime(incident.reportedAt)],
    [
      "Location",
      incident.locationText?.trim()
        ? `${incident.locationText.trim()} (approximate)`
        : "Not given",
    ],
  ];

  if (incident.reportedToPolice) {
    fields.push([
      "Police ref",
      incident.policeReference?.trim() ||
        "Reporter says this was reported to the police",
    ]);
  }

  const width = Math.max(...fields.map(([label]) => label.length)) + 1;

  const lines = [
    `${DOCUMENT_TITLE} — ${APP_NAME}`,
    input.villageName,
    "",
    RULE,
    incident.title.trim(),
    RULE,
    "",
    ...fields.map(([label, value]) => `${`${label}:`.padEnd(width + 2)}${value}`),
    "",
    "DESCRIPTION",
    incident.description.trim() || "(no description was given)",
  ];

  if (incident.recurring && incident.patternNote?.trim()) {
    lines.push("", "PATTERN", incident.patternNote.trim());
  }

  if (!incident.anonymized) {
    lines.push(
      "",
      "NOTE",
      "This description was never rewritten, so it is the reporter's own wording",
      "and may name people, vehicles or addresses. Read it before you forward it.",
    );
  }

  lines.push(
    "",
    `Full report: ${appUrlFor(`/incidents/${incident.id}`, appUrl)}`,
    "(opens for signed-in residents and coordinators of this village)",
    "",
    // A single report carries no analysis section at all — nothing in this
    // document was written by a model, only the description it quotes.
    ...footer(input.dataController, false),
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// A period
// ---------------------------------------------------------------------------

/**
 * Everything published in a village over a period, as one document.
 *
 * The order is the order a recipient reads in: what the period looked like,
 * where it clustered, what it might mean, and only then the log. A police
 * officer with two minutes reads the first screen; a clerk writing minutes
 * reads the log.
 *
 * The narrative is optional and the document is complete without it. Every
 * figure above it is counted from the database, so a report produced when the
 * AI was unreachable is a shorter report rather than a wrong one.
 */
export function formatCommunityReport(
  report: CommunityReportData,
  appUrl: string = appBaseUrl(),
): string {
  const days = rangeDays(report.from, report.to);

  const lines: string[] = [
    `${DOCUMENT_TITLE} — ${APP_NAME}`,
    report.villageName,
    "",
    `Period:     ${formatDate(report.from)} to ${formatDate(report.to)}`,
    `Generated:  ${formatDateTime(report.generatedAt)}`,
    "",
    RULE,
    "SUMMARY",
    RULE,
    "",
    `Total reports published in this period: ${report.total}`,
    trendLine(report.total, report.previousTotal, days),
    "",
    "By category",
    ...countLines(
      report.byType.map((row) => ({
        label: INCIDENT_TYPE_LABELS[row.key],
        count: row.count,
      })),
    ),
    "",
    "By severity",
    ...countLines(
      report.bySeverity.map((row) => ({
        label: SEVERITY_LABELS[row.key],
        count: row.count,
      })),
    ),
    "",
    RULE,
    "HOTSPOTS",
    RULE,
    "",
  ];

  if (report.hotspots.length === 0) {
    lines.push("No location was named more than once in this period.");
  } else {
    lines.push(
      ...report.hotspots.map(
        (spot, index) =>
          `${index + 1}. ${spot.location} — ${spot.count} report${
            spot.count === 1 ? "" : "s"
          }`,
      ),
      "",
      "Grouped by the landmark residents typed, so wording varies between reports.",
    );
  }

  /*
    What the village made of its own reports, between its counts and somebody
    else's count of the same place.

    Omitted entirely when nothing has been voted on — see
    `CommunityReportData.mostConcerning`. `CONCERN_NOTE` travels with it for the
    reason `POLICE_COMPARISON_NOTE` travels with the police figures: two numbers
    in a police document with nothing saying who counted them and on what basis
    is an assertion dressed as data.
  */
  if (report.mostConcerning.length > 0) {
    lines.push("", RULE, "MOST CONCERNING TO RESIDENTS", RULE, "");

    for (const [index, item] of report.mostConcerning.entries()) {
      lines.push(
        `${index + 1}. ${item.title.trim()} (${item.reference})`,
        `   ${INCIDENT_TYPE_LABELS[item.type]} · ${SEVERITY_LABELS[item.severity]} · ${
          item.locationText?.trim() || "location not given"
        }`,
        `   ${item.votes.up} resident${item.votes.up === 1 ? "" : "s"} rated this more serious than it looks, ${item.votes.down} less.`,
      );
    }

    lines.push("", CONCERN_NOTE);
  }

  /*
    The official figures, between the village's own numbers and the analysis of
    them. Placed here because it is counted data and the analysis should follow
    every count in the document — and because a recipient who reads the
    VillageWatch totals above then immediately meets the sentence explaining
    what the police series measures differently, rather than three sections
    later.

    Omitted entirely when there is nothing held. See `CommunityReportData.police`
    for why an empty section would be worse than none.
  */
  if (report.police) {
    lines.push("", RULE, "POLICE RECORDED CRIME", RULE, "", ...policeLines(report.police));
  }

  lines.push("", RULE, "PATTERN ANALYSIS", RULE, "");

  if (!report.narrative) {
    lines.push(
      "No analysis was generated for this report. The figures above and the log",
      "below are counted directly from the reports.",
    );
  } else {
    lines.push(report.narrative.summary.trim());

    if (report.narrative.patterns.length > 0) {
      lines.push(
        "",
        ...report.narrative.patterns.map((note) => `- ${note.trim()}`),
      );
    }

    if (report.narrative.recommendation?.trim()) {
      lines.push("", `Suggested focus: ${report.narrative.recommendation.trim()}`);
    }

    lines.push(
      "",
      report.narrative.source === "ai"
        ? `Written by ${report.narrative.model ?? "an AI model"} from the reports listed below. It reflects what was reported, not a police assessment.`
        : "Assembled from the counts above. No AI summary was available when this report was produced.",
    );
  }

  lines.push("", RULE, "INCIDENT LOG", RULE, "");

  if (report.incidents.length === 0) {
    lines.push("Nothing was published in this village during the period.");
  } else {
    for (const incident of report.incidents) {
      lines.push(
        `${formatDateTime(incident.occurredAt)} | ${incident.reference} | ${
          INCIDENT_TYPE_LABELS[incident.type]
        } | ${SEVERITY_LABELS[incident.severity]}`,
        `  ${incident.title.trim()}`,
        `  Location: ${incident.locationText?.trim() || "not given"}`,
        `  ${truncateWords(
          incident.description.trim().replace(/\s+/g, " "),
          REPORT_DESCRIPTION_MAX_CHARS,
        )}`,
      );

      if (incident.recurring && incident.patternNote?.trim()) {
        lines.push(`  Pattern: ${incident.patternNote.trim()}`);
      }

      lines.push("");
    }

    if (report.omitted > 0) {
      lines.push(
        `${report.omitted} further report${
          report.omitted === 1 ? "" : "s"
        } in this period are not listed above. The counts,`,
        "breakdowns and hotspots cover the whole period. Narrow the dates, or use the",
        "CSV export, to see the rest.",
      );
      lines.push("");
    }

    lines.push(
      `Full reports: ${appUrlFor("/incidents", appUrl)}`,
      "(opens for signed-in residents and coordinators of this village)",
      "",
    );
  }

  lines.push(
    ...footer(report.dataController, report.narrative?.source === "ai"),
  );

  return lines.join("\n");
}

/** Filename for the printed or downloaded document. */
export function reportFileName(report: {
  villageName: string;
  from: Date | string | number;
  to: Date | string | number;
}): string {
  const slug = report.villageName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  const stamp = (value: Date | string | number) =>
    new Date(value).toISOString().slice(0, 10);

  return `villagewatch-report-${slug || "village"}-${stamp(report.from)}-to-${stamp(report.to)}`;
}
