/**
 * The arithmetic behind every chart on the Overview tab — bucketing a period
 * into a time axis, and averaging a severity.
 *
 * **Pure and client-safe**, the same split `votes.ts` has against
 * `incident-votes.ts`: this module holds the rules and
 * `src/lib/charts/incident-series.ts` holds the Prisma half. Nothing here
 * imports Prisma or reads a secret, so the off-by-ones below are unit tested
 * rather than discovered on a coordinator's screen — which matters more here
 * than it looks, because every failure in this file draws a *plausible* chart.
 *
 * ## Gaps are filled here rather than in SQL
 *
 * `GROUP BY date_trunc(...)` returns a row only for a bucket that has incidents
 * in it, so a quiet fortnight comes back as no rows at all. Handed straight to
 * a line chart that is not a flat line through zero — it is a line that skips
 * the fortnight and joins the weeks either side, which reads as steady activity
 * over a period when nothing was reported. The whole axis is therefore built
 * from the *period*, and the counts are looked up into it.
 *
 * A `generate_series` LEFT JOIN would do the same thing one layer down and is
 * the textbook answer. It is deliberately not what this does: the suite runs
 * with no database (see The test suite in CLAUDE.md), and a rule whose failure
 * mode is a convincing wrong picture is one worth being able to assert.
 *
 * ## The bucket space is UTC, and that is a decision rather than a default
 *
 * `incidents.occurred_at` is `TIMESTAMP(3)` — **without** time zone — so
 * `date_trunc` on it involves no session zone and returns the same bucket
 * whatever machine asks. The axis below is built with the `getUTC*` accessors
 * to land in that same space.
 *
 * The seam is that `TimeRange.from`/`to` are host-zone midnights (see
 * `dateInputValue` in `src/lib/date-range.ts`, and the round-trip bug written
 * down there). On Vercel the host zone is UTC and the two coincide exactly. On
 * a British laptop in summer the first bucket of a period can start a day
 * early — a cosmetic edge in development only, and never a wrong *count*,
 * because the filtering and the bucket key both come from the database.
 */

export type Granularity = "day" | "week" | "month";

/** One point on a chart's time axis. */
export type SeriesBucket = {
  /** `yyyy-mm-dd` of the bucket's first day, in UTC. Stable, and the join key. */
  key: string;
  /** What the axis prints — "7 Sep", "w/c 7 Sep", "Sep 2026". */
  label: string;
  count: number;
};

/**
 * Where a period stops being readable one way and starts being readable
 * another.
 *
 * The dashboard offers 7, 30, 90 and 365 days plus a custom range clamped at
 * `MAX_CUSTOM_RANGE_DAYS` (730), so the worst case in each band is 31 daily
 * points, 17 weekly and 24 monthly. Those are the numbers the axis has to stay
 * legible at on a phone, which is what the thresholds are chosen against rather
 * than any property of the data.
 *
 * A null `days` is an unbounded period. The dashboard does not offer one, and
 * monthly is the only answer that could not produce thousands of points.
 */
export function chooseGranularity(days: number | null): Granularity {
  if (days === null) return "month";
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

/** Midnight UTC on the day `date` falls in. */
function utcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/**
 * The start of the bucket a date belongs to, in UTC.
 *
 * Weeks start on **Monday**, which is what Postgres `date_trunc('week', …)`
 * does and what a British reader means by a week. `getUTCDay()` returns 0 for
 * Sunday, so the shift is `(day + 6) % 7` rather than `day - 1` — the naive
 * form sends Sunday *forward* six days into the week it has just finished,
 * which is the classic version of this bug and draws a chart that is merely
 * slightly wrong.
 */
export function bucketStart(date: Date, granularity: Granularity): Date {
  if (granularity === "month") {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  }

  const day = utcDay(date);

  if (granularity === "week") {
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  }

  return day;
}

/** `yyyy-mm-dd` in UTC — the key both halves of a series join on. */
export function bucketKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const MONTH_LABEL = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/**
 * What the axis prints for a bucket.
 *
 * A weekly bucket says "w/c" rather than printing a bare date: the point sits
 * at the Monday and covers the six days after it, and a naked "7 Sep" over a
 * week of reports invites somebody to read the whole column as that Monday's.
 */
export function bucketLabel(start: Date, granularity: Granularity): string {
  if (granularity === "month") return MONTH_LABEL.format(start);
  if (granularity === "week") return `w/c ${DAY_LABEL.format(start)}`;
  return DAY_LABEL.format(start);
}

/** The next bucket along. Mutating a copy, so the caller's date is untouched. */
function advance(start: Date, granularity: Granularity): Date {
  const next = new Date(start);

  if (granularity === "month") next.setUTCMonth(next.getUTCMonth() + 1);
  else if (granularity === "week") next.setUTCDate(next.getUTCDate() + 7);
  else next.setUTCDate(next.getUTCDate() + 1);

  return next;
}

/**
 * How many buckets a period may produce before the axis is abandoned.
 *
 * Nothing the dashboard offers comes near it — 730 days monthly is 24 — so it
 * is a guard against a caller with a nonsense range rather than a product
 * decision, and it is a ceiling rather than a throw: a chart is furniture on a
 * page that has to render.
 */
const MAX_BUCKETS = 400;

/**
 * The period as a complete axis, with every bucket present and the empty ones
 * at zero.
 *
 * `counts` is keyed by `bucketKey` — whatever the database grouped — and is
 * *looked up* rather than iterated, so a row for a bucket outside the period
 * cannot widen the axis. That is the direction worth being strict in: the
 * chart's job is to describe the period the heading names.
 */
export function buildSeries({
  from,
  to,
  granularity,
  counts,
}: {
  from: Date;
  to: Date;
  granularity: Granularity;
  counts: ReadonlyMap<string, number>;
}): SeriesBucket[] {
  const buckets: SeriesBucket[] = [];
  const last = bucketStart(to, granularity);

  let cursor = bucketStart(from, granularity);

  while (cursor.getTime() <= last.getTime() && buckets.length < MAX_BUCKETS) {
    const key = bucketKey(cursor);

    buckets.push({
      key,
      label: bucketLabel(cursor, granularity),
      count: counts.get(key) ?? 0,
    });

    cursor = advance(cursor, granularity);
  }

  return buckets;
}
