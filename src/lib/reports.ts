import type { IncidentType, Severity } from "@/generated/prisma/enums";
import type {
  CommunityReportData,
  ReportIncident,
  ReportNarrative,
} from "@/lib/community-report";
import { rangeDays, reportController } from "@/lib/community-report";
import { dateInputValue } from "@/lib/date-range";
import {
  DEFAULT_REPORT_RANGE,
  HOTSPOT_COUNT,
  INCIDENT_TYPE_LABELS,
  PUBLIC_INCIDENT_STATUSES,
  REPORT_MAX_INCIDENTS,
  REPORT_MAX_RANGE_DAYS,
  REPORT_RANGES,
  SEVERITIES,
  type ReportRangePreset,
} from "@/lib/constants";
import { getVillagePoliceComparison } from "@/lib/police-data";
import { prisma } from "@/lib/prisma";
import { reportRangeSchema } from "@/lib/validations";

/**
 * Assembling a community safety report. **Server only** — it reads across the
 * whole village through Prisma.
 *
 * The document itself is formatted by `src/lib/community-report.ts`, which is
 * client-safe. This module is the half that touches the database: resolving the
 * period from a query string, counting what fell inside it, and producing the
 * narrative when the AI is not available.
 *
 * ## Which reports are in it
 *
 * `PUBLIC_INCIDENT_STATUSES` — published and resolved, and nothing else. This
 * is narrower than the CSV export, which carries everything bar `REMOVED`, and
 * the difference is the recipient. The spreadsheet is a coordinator's own copy
 * of their village's data; this document is written to be sent to somebody
 * outside the village. A report still in the queue has not cleared moderation
 * (domain rule 6) and a rejected one is a report a coordinator decided should
 * not be published at all — neither belongs in a document addressed to the
 * police over the reporter's head.
 *
 * `ARCHIVED` is absent for the same reason it never comes up: a report is
 * archived at twelve months (`RETENTION.incidentArchiveMonths`) and the widest
 * range this page offers is a year, so an archived report inside the window is
 * a report that has just aged out of public view. It should leave the document
 * with it.
 *
 * Everything is keyed on `occurredAt`, not `reportedAt`: a police officer asking
 * about last week means the week things happened in.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// The period
// ---------------------------------------------------------------------------

export type ReportRange = {
  preset: ReportRangePreset;
  from: Date;
  to: Date;
  /** Whole days the range covers. Used for the comparison period. */
  days: number;
  /** `yyyy-mm-dd`, for the date inputs to render back. */
  fromValue: string;
  toValue: string;
  /** Set when a submitted custom range was adjusted, so the form can say so. */
  notice: string | null;
};

/**
 * `yyyy-mm-dd` in the village's own zone, which is the one on the inputs.
 *
 * Shared with `src/lib/date-range.ts` rather than duplicated. The two resolvers
 * stay separate — the periods `/reports` offers are not the periods the map
 * offers — but the string a date input renders is the same string either way,
 * and two copies of that would drift the first time one was corrected.
 */
const dateValue = dateInputValue;

/**
 * Turns the query string into a period.
 *
 * Three ways in, and they are tried in that order: `?days=<n>`, then one of the
 * `REPORT_RANGES` presets as `?range=`, then `?range=custom` with `?from=` and
 * `?to=`. `days` is the short form a bare link uses — see the PDF route — and
 * it wins where both are present.
 *
 * **Nothing here rejects.** Every branch has a defined outcome, because this
 * runs on a page render: a hand-edited or stale URL should produce the default
 * period with a line explaining the adjustment, not an error page in front of
 * a coordinator who is late for a meeting. `notice` is how the adjustment is
 * admitted rather than silently applied.
 *
 * A custom range is inclusive of both days the coordinator picked — `to` is
 * pushed to the end of that day. Somebody asking for the 1st to the 7th means
 * seven days, and a naive midnight boundary would give them six and a bit and
 * drop every report filed on the last afternoon.
 *
 * **The two boundaries are the server's midnight, not London's.** `new Date()`
 * on a bare `yyyy-mm-ddThh:mm:ss` parses in the host zone, which is UTC on
 * Vercel, while the inputs are rendered in `Europe/London`. Through British
 * summer time that is an hour of skew at each end. It is left as it is
 * deliberately: correcting it means carrying a zone database to move a
 * boundary by an hour on a report covering a week or a month, and an incident
 * an hour either side of midnight is not what a police liaison meeting turns
 * on. Worth knowing before somebody reconciles this against the CSV export,
 * which counts on the same basis.
 */
export function resolveReportRange(
  params: Record<string, string | string[] | undefined>,
  now: Date = new Date(),
): ReportRange {
  const single = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const parsed = reportRangeSchema.parse({
    range: single(params.range) ?? DEFAULT_REPORT_RANGE,
    from: single(params.from),
    to: single(params.to),
    days: single(params.days),
  });

  /*
    `?days=` first, because a caller that wrote one meant it.

    It is here rather than in the route that introduced it so that there is
    still one resolver: the ceiling, the fallbacks and the shape of the returned
    period are decided in exactly one place, and `/reports` understands the same
    parameter its own PDF link does. The arithmetic is deliberately identical to
    the preset branch below — `now - days` to `now` — so `?days=7` and
    `?range=7` are the same period rather than two that agree most of the time.

    A value matching a preset reports that preset, so the picker on the page
    still highlights "Last 7 days" for a URL that arrived as `?days=7`.
  */
  if (parsed.days !== undefined) {
    const days = Math.min(parsed.days, REPORT_MAX_RANGE_DAYS);
    const from = new Date(now.getTime() - days * DAY_MS);
    const matching = REPORT_RANGES.find((r) => r.days === days);

    return {
      preset: matching?.value ?? "custom",
      from,
      to: now,
      days,
      fromValue: dateValue(from),
      toValue: dateValue(now),
      notice:
        days === parsed.days
          ? null
          : `A report covers at most ${REPORT_MAX_RANGE_DAYS} days, so the start date has been moved.`,
    };
  }

  /*
    "This year" — 1 January to now, in the host zone, which is the same midnight
    every other boundary in this module is taken at.

    Its own branch because it is the one preset whose span cannot be written as
    a number of days back from now: it is 1 day long on 1 January and 365 on 31
    December, so it has to be computed rather than looked up. `days` is the
    elapsed length, which is what `collectVillageReport` compares against the
    preceding period — for a report filed in March, that is the same stretch of
    last year's winter rather than the whole of last year.

    Deliberately not clamped to `REPORT_MAX_RANGE_DAYS`. See the note on that
    constant: the ceiling bounds what somebody can type, and a leap year would
    otherwise shorten a named period by a day and claim it was adjusted.
  */
  if (parsed.range === "year") {
    const from = new Date(now.getFullYear(), 0, 1);

    return {
      preset: "year",
      from,
      to: now,
      days: rangeDays(from, now),
      fromValue: dateValue(from),
      toValue: dateValue(now),
      notice: null,
    };
  }

  const preset = REPORT_RANGES.find((r) => r.value === parsed.range);

  if (preset?.days) {
    const from = new Date(now.getTime() - preset.days * DAY_MS);

    return {
      preset: parsed.range,
      from,
      to: now,
      days: preset.days,
      fromValue: dateValue(from),
      toValue: dateValue(now),
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
    const days = REPORT_RANGES[0].days ?? 7;
    const from = new Date(now.getTime() - days * DAY_MS);

    return {
      preset: "custom",
      from,
      to: now,
      days,
      fromValue: dateValue(from),
      toValue: dateValue(now),
      notice: parsed.from || parsed.to ? "Pick both a start and an end date." : null,
    };
  }

  let from = fromParsed;
  let to = toParsed;
  let notice: string | null = null;

  if (from > to) {
    // Swapped rather than refused. It is unambiguous what was meant, and an
    // error message for a mistake the app can fix is a message nobody thanks
    // you for.
    [from, to] = [to, from];
    notice = "The dates were the wrong way round, so they have been swapped.";
  }

  if (to > now) {
    to = now;
    notice ??= "The end date is in the future, so the report runs to today.";
  }

  if (to.getTime() - from.getTime() > REPORT_MAX_RANGE_DAYS * DAY_MS) {
    from = new Date(to.getTime() - REPORT_MAX_RANGE_DAYS * DAY_MS);
    notice = `A report covers at most ${REPORT_MAX_RANGE_DAYS} days, so the start date has been moved.`;
  }

  return {
    preset: "custom",
    from,
    to,
    days: rangeDays(from, to),
    fromValue: dateValue(from),
    toValue: dateValue(to),
    notice,
  };
}

// ---------------------------------------------------------------------------
// The data
// ---------------------------------------------------------------------------

/** Everything the report needs, bar the narrative, which is asked for later. */
export type CollectedReport = Omit<CommunityReportData, "narrative"> & {
  range: ReportRange;
};

/**
 * Counts the period and pulls the log.
 *
 * The aggregates are computed by the database over the **whole** range, and only
 * the log is capped at `REPORT_MAX_INCIDENTS`. A `groupBy` counted over a
 * truncated `findMany` would put a wrong total in a document going to the
 * police, which is the one failure in this file that would not look like one.
 */
export async function collectVillageReport(input: {
  villageId: string;
  villageName: string;
  parishCouncil: string | null;
  range: ReportRange;
  now?: Date;
}): Promise<CollectedReport> {
  const { range } = input;
  const now = input.now ?? new Date();

  const published = {
    villageId: input.villageId,
    status: { in: [...PUBLIC_INCIDENT_STATUSES] },
  };

  const inRange = {
    ...published,
    occurredAt: { gte: range.from, lte: range.to },
  };

  // The same length of period, ending where this one starts.
  const previousFrom = new Date(range.from.getTime() - range.days * DAY_MS);

  const [total, previousTotal, byType, bySeverity, hotspotRows, rows, police] =
    await Promise.all([
      prisma.incident.count({ where: inRange }),
      prisma.incident.count({
        where: {
          ...published,
          occurredAt: { gte: previousFrom, lt: range.from },
        },
      }),
      prisma.incident.groupBy({
        by: ["type"],
        where: inRange,
        _count: { _all: true },
      }),
      prisma.incident.groupBy({
        by: ["severity"],
        where: inRange,
        _count: { _all: true },
      }),
      prisma.incident.groupBy({
        by: ["locationText"],
        // A report filed without a landmark has no hotspot to belong to, and
        // bucketing every one of them under "no location" would reliably
        // produce a phantom top spot — same reasoning as the dashboard.
        where: { ...inRange, locationText: { not: null } },
        _count: { _all: true },
        orderBy: { _count: { locationText: "desc" } },
        take: HOTSPOT_COUNT,
      }),
      prisma.incident.findMany({
        where: inRange,
        select: {
          id: true,
          reference: true,
          type: true,
          severity: true,
          title: true,
          // The anonymised public column. `rawDescription` is absent from this
          // select and from `ReportIncident`, so there is nothing in the
          // document that is not already on the village map (domain rule 1).
          description: true,
          locationText: true,
          occurredAt: true,
          reportedAt: true,
          recurring: true,
          patternNote: true,
          anonymized: true,
          reportedToPolice: true,
          policeReference: true,
        },
        orderBy: { occurredAt: "desc" },
        take: REPORT_MAX_INCIDENTS,
      }),
      /*
        The Home Office's own figures for the calendar months this period
        overlaps, or null when none are held. It joins the same `Promise.all`
        as everything else rather than being awaited after it: it is three
        cheap reads against tables this village owns, and a report that took
        an extra round trip to say "no official data yet" would be paying for
        the absence.

        It never reaches data.police.uk. The fetching is the sync route's job
        (`GET|POST /api/cron/police-data`) — a page render that called a third
        party would put somebody else's uptime on the path of a document a
        coordinator is waiting for, which is the same reasoning the pattern
        analysis is a button rather than a render.
      */
      getVillagePoliceComparison({
        villageId: input.villageId,
        from: range.from,
        to: range.to,
      }),
    ]);

  const incidents: ReportIncident[] = rows.map((row) => ({
    ...row,
    // ISO strings, because this crosses into a Client Component — the report
    // is assembled in the browser once the narrative comes back.
    occurredAt: row.occurredAt.toISOString(),
    reportedAt: row.reportedAt.toISOString(),
  }));

  return {
    villageName: input.villageName,
    dataController: reportController(input.parishCouncil),
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    generatedAt: now.toISOString(),
    total,
    previousTotal,
    byType: byType
      .map((row) => ({ key: row.type as IncidentType, count: row._count._all }))
      .sort((a, b) => b.count - a.count),
    // Ordered low → critical from `SEVERITIES` rather than by count, so the
    // scale reads as a scale. Empty levels are dropped.
    bySeverity: SEVERITIES.flatMap((meta) => {
      const found = bySeverity.find((row) => row.severity === meta.value);
      return found && found._count._all > 0
        ? [{ key: meta.value as Severity, count: found._count._all }]
        : [];
    }),
    hotspots: hotspotRows.flatMap((row) =>
      row.locationText
        ? [{ location: row.locationText, count: row._count._all }]
        : [],
    ),
    police,
    incidents,
    omitted: Math.max(0, total - incidents.length),
    range,
  };
}

// ---------------------------------------------------------------------------
// The narrative without an AI
// ---------------------------------------------------------------------------

/**
 * What the pattern-analysis section says when Claude was unavailable.
 *
 * Counted, never invented. The digest takes the same position for the same
 * reason — inventing prose to fill the gap would make an outage look like a
 * working report, and this one is going to a police officer who has no way to
 * tell the difference. `source: "counted"` is carried through to the document,
 * which says on its face which of the two it has.
 */
export function countedNarrative(
  report: Pick<
    CollectedReport,
    "total" | "previousTotal" | "byType" | "hotspots"
  > & {
    /**
     * Whole days the period covers — `ReportRange.days`.
     *
     * Taken on its own rather than as the whole range, because it is the only
     * field this reads and the range is the one thing on a collected report
     * that does not cross into a Client Component. Asking for the number keeps
     * both callers honest about that: `/reports`'s action has the range in
     * hand, and the PDF route has only what it resolved.
     */
    days: number;
  },
): ReportNarrative {
  const period = `${report.days} day${report.days === 1 ? "" : "s"}`;

  if (report.total === 0) {
    return {
      summary: `No reports were published in this village in the ${period} covered by this report.`,
      patterns: [],
      recommendation: null,
      source: "counted",
      model: null,
    };
  }

  const top = report.byType[0];
  const change = report.total - report.previousTotal;

  const sentences = [
    `${report.total} report${report.total === 1 ? "" : "s"} ${
      report.total === 1 ? "was" : "were"
    } published in this village over ${period}.`,
  ];

  if (top) {
    sentences.push(
      `The most common category was ${INCIDENT_TYPE_LABELS[top.key].toLowerCase()} (${top.count}).`,
    );
  }

  if (report.previousTotal > 0) {
    sentences.push(
      change === 0
        ? `That is the same as the preceding ${period}.`
        : `That compares with ${report.previousTotal} in the preceding ${period}.`,
    );
  }

  const patterns = report.hotspots
    .filter((spot) => spot.count > 1)
    .map(
      (spot) =>
        `${spot.count} reports named ${spot.location}, as residents typed it.`,
    );

  return {
    summary: sentences.join(" "),
    patterns,
    recommendation: null,
    source: "counted",
    model: null,
  };
}
