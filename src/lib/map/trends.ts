/**
 * The Trends sheet's timeline — the bar chart over the period and the
 * slider that replays it on the map. Pure and client-safe.
 *
 * The slider's value is a **scrub**: how many days back from today the map
 * stops. At 0 the map shows the whole period, as it does at rest. Dragging it
 * back hides everything after that day, so moving it forward again replays the
 * period on the map in the order things were reported — the handoff's
 * timeline, and what "drag to replay" means. The map keeps its framing while
 * this happens; see `MapScreen`.
 *
 * Days are counted back from `now` in whole days, so a report from three hours
 * ago is day 0 and belongs to "today".
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How many bars a period is drawn in: one a day up to a month, thirty for
 * ninety days (three days a bar), twenty-six for a year (a fortnight a bar) —
 * the handoff's choice, enough to see a shape at 375px and few enough that
 * each bar is still a finger's width apart.
 */
export function bucketCount(periodDays: number): number {
  if (periodDays <= 30) return periodDays;
  if (periodDays <= 90) return 30;
  return 26;
}

export type TrendBucket = {
  count: number;
  /** Days back from today at the bucket's most recent edge. */
  newestDay: number;
  /** Days back at its oldest edge. */
  oldestDay: number;
};

/** Whole days between an ISO time and `now`, or null if it does not parse. */
export function daysAgo(iso: string, now: number): number | null {
  const at = new Date(iso).getTime();
  return Number.isNaN(at) ? null : Math.max(0, Math.floor((now - at) / DAY_MS));
}

/**
 * Counts per bar, oldest bar first. Anything outside the period — or whose
 * date does not parse — is not counted, and an empty bar is a zero rather than
 * absent, so a quiet fortnight draws as a gap rather than being squeezed out.
 */
export function trendBuckets(
  incidents: readonly { occurredAt: string }[],
  periodDays: number,
  now: number,
): TrendBucket[] {
  const n = bucketCount(periodDays);
  const width = Math.ceil(periodDays / n);
  const counts = new Array<number>(n).fill(0);

  for (const incident of incidents) {
    const days = daysAgo(incident.occurredAt, now);
    if (days === null || days >= periodDays) continue;
    counts[Math.min(n - 1, Math.floor(days / width))] += 1;
  }

  // Index 0 is today's bar; reverse so the chart reads left to right in time.
  return counts
    .map((count, b) => ({
      count,
      newestDay: b * width,
      oldestDay: Math.min(periodDays - 1, b * width + width - 1),
    }))
    .reverse();
}

/**
 * Whether a bar is still on the map at this scrub: everything from the scrub
 * day back is shown, everything more recent is hidden.
 */
export function bucketShown(bucket: TrendBucket, scrub: number): boolean {
  return bucket.oldestDay >= scrub;
}

/**
 * The map's cut-off for a scrub, as epoch milliseconds at the end of that day
 * in the device's zone — or null at 0, which is "up to today", the map at rest.
 */
export function untilForScrub(scrub: number, now: number): number | null {
  if (scrub <= 0) return null;
  const day = new Date(now - scrub * DAY_MS);
  return new Date(
    day.getFullYear(),
    day.getMonth(),
    day.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
}

/** How far the play button steps per tick: about thirty ticks a period. */
export function playStep(periodDays: number): number {
  return Math.max(1, Math.round(periodDays / 30));
}

const DAY_LABEL = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

/** "4 Sept" — the date `days` back from `now`. */
export function dayLabel(days: number, now: number): string {
  return DAY_LABEL.format(new Date(now - days * DAY_MS));
}
