import { prisma } from "@/lib/prisma";
import { PUBLIC_INCIDENT_STATUSES } from "@/lib/constants";
import type { TimeRange } from "@/lib/date-range";
import {
  buildSeries,
  chooseGranularity,
  type Granularity,
  type SeriesBucket,
} from "@/lib/charts/series";

/**
 * The Prisma half of the Overview tab's time series — the half `series.ts`
 * deliberately does not hold, so the arithmetic stays testable with no
 * database. `votes.ts` / `incident-votes.ts` is the same split.
 *
 * **Server only.** It imports Prisma, so a Client Component reaching for it
 * breaks the build.
 *
 * ## Why this is raw SQL when everything else on the page is `groupBy`
 *
 * Prisma cannot group by a derived value, and a month is a derived value —
 * `groupBy: ["occurredAt"]` buckets by the millisecond, which is one row per
 * incident. The alternative is reading the period's incidents into the lambda
 * and bucketing them in JavaScript, which works and is what a first pass would
 * do; it also transfers a row per report to count them, on the page a busy
 * village's coordinator leaves open. `date_trunc` counts them where they are.
 *
 * The enum is compared as text and the unit is a bound parameter — the same
 * shape `detect-patterns.ts` uses, and it is what keeps a hand-built
 * `incident_status[]` literal out of the query.
 *
 * ## Every read here degrades rather than throwing
 *
 * This is furniture on a page that has to render. A chart that could take the
 * Overview tab down with it would be a worse trade than a chart that is
 * sometimes missing, which is the rule the vote tally and the police panels on
 * the same page already follow.
 */

/** Narrowed to the three units `chooseGranularity` can return. */
const TRUNC_UNIT: Record<Granularity, string> = {
  day: "day",
  week: "week",
  month: "month",
};

/** Spread because Prisma's generated filters want a mutable array. */
const PUBLIC_STATUS_STRINGS: string[] = [...PUBLIC_INCIDENT_STATUSES];

/** Shape the raw query hands back — snake_case, and the count already an int. */
type BucketRow = {
  bucket: string;
  count: number;
};

export type IncidentTrend = {
  granularity: Granularity;
  buckets: SeriesBucket[];
};

/**
 * Published reports in the period, bucketed for a line.
 *
 * Counted over `occurredAt` rather than `reportedAt`, which is what every other
 * figure on the Overview tab is counted over — the question a coordinator is
 * asking a trend line is "when did things happen", and a batch of old reports
 * filed on one evening would otherwise draw a spike on a day nothing occurred.
 *
 * Published only (domain rule 6), village-scoped (domain rule 4), and both
 * come off the same predicate the rest of the page uses.
 *
 * Returns an empty axis for an unbounded period rather than every month since
 * the village was created: `DASHBOARD_RANGE_VALUES` does not offer one, and
 * guessing a start date is how a chart ends up describing a period nobody
 * chose.
 */
export async function getIncidentTrend({
  villageId,
  range,
}: {
  villageId: string;
  range: TimeRange;
}): Promise<IncidentTrend> {
  const granularity = chooseGranularity(range.days);

  if (!process.env.DATABASE_URL || !range.from || !range.to) {
    return { granularity, buckets: [] };
  }

  const unit = TRUNC_UNIT[granularity];

  let rows: BucketRow[] = [];

  try {
    rows = await prisma.$queryRaw<BucketRow[]>`
      SELECT
        to_char(date_trunc(${unit}, occurred_at), 'YYYY-MM-DD') AS bucket,
        COUNT(*)::int AS count
      FROM incidents
      WHERE village_id = ${villageId}::uuid
        AND status::text = ANY (${PUBLIC_STATUS_STRINGS}::text[])
        AND occurred_at >= ${range.from}
        AND occurred_at <= ${range.to}
      GROUP BY 1
    `;
  } catch (cause) {
    console.warn(
      "Could not read the incident trend for village %s; rendering the " +
        "Overview tab without it.",
      villageId,
      cause,
    );

    return { granularity, buckets: [] };
  }

  const counts = new Map<string, number>(
    rows.map((row) => [row.bucket, Number(row.count)]),
  );

  return {
    granularity,
    buckets: buildSeries({
      from: range.from,
      to: range.to,
      granularity,
      counts,
    }),
  };
}

/**
 * Reports per day over a fixed trailing window, for the strip above the
 * activity feed.
 *
 * **Deliberately not bounded by the period control**, which is the activity
 * feed's own rule and is here for its reason: this answers "what has the last
 * few weeks looked like", and a strip that emptied because somebody selected
 * seven days to read their queue would make a working village look dead. The
 * heading says the window so the exception is visible, the same way the
 * "waiting for review" card says "all time".
 */
export async function getRecentDailyActivity({
  villageId,
  days,
  now = new Date(),
}: {
  villageId: string;
  days: number;
  now?: Date;
}): Promise<SeriesBucket[]> {
  if (!process.env.DATABASE_URL) return [];

  // Inclusive of today, so `days` columns are drawn rather than `days + 1`.
  const from = new Date(now);
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);

  let rows: BucketRow[] = [];

  try {
    rows = await prisma.$queryRaw<BucketRow[]>`
      SELECT
        to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') AS bucket,
        COUNT(*)::int AS count
      FROM incidents
      WHERE village_id = ${villageId}::uuid
        AND status::text = ANY (${PUBLIC_STATUS_STRINGS}::text[])
        AND occurred_at >= ${from}
      GROUP BY 1
    `;
  } catch (cause) {
    console.warn(
      "Could not read recent daily activity for village %s; rendering the " +
        "activity feed without the strip.",
      villageId,
      cause,
    );

    return [];
  }

  const counts = new Map<string, number>(
    rows.map((row) => [row.bucket, Number(row.count)]),
  );

  return buildSeries({ from, to: now, granularity: "day", counts });
}
