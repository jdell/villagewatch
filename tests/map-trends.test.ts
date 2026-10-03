import { describe, expect, it } from "vitest";
import {
  bucketCount,
  bucketShown,
  daysAgo,
  playStep,
  trendBuckets,
  untilForScrub,
} from "@/lib/map/trends";

/**
 * The Trends sheet's timeline — the bars and the replay. The off-by-ones are
 * the failure worth catching: a report from three hours ago in yesterday's
 * bar, an empty fortnight squeezed out of the chart, or a scrub that hides
 * today's reports at "up to today".
 */

const NOW = new Date(2026, 9, 3, 15, 0).getTime();
const DAY = 24 * 3600_000;
const ago = (days: number, hours = 0) =>
  new Date(NOW - days * DAY - hours * 3600_000).toISOString();

describe("bucketCount", () => {
  it("is a bar a day to a month, thirty bars for ninety days, twenty-six for a year", () => {
    expect(bucketCount(7)).toBe(7);
    expect(bucketCount(30)).toBe(30);
    expect(bucketCount(90)).toBe(30);
    expect(bucketCount(365)).toBe(26);
  });
});

describe("daysAgo", () => {
  it("puts a report from a few hours ago in today", () => {
    expect(daysAgo(ago(0, 3), NOW)).toBe(0);
    expect(daysAgo(ago(1, 1), NOW)).toBe(1);
  });

  it("returns null for a date that does not parse", () => {
    expect(daysAgo("not a date", NOW)).toBeNull();
  });
});

describe("trendBuckets", () => {
  it("counts per day, oldest bar first, with empty days as zeroes", () => {
    const buckets = trendBuckets([{ occurredAt: ago(0, 2) }, { occurredAt: ago(0, 5) }, { occurredAt: ago(6) }], 7, NOW);
    expect(buckets.map((b) => b.count)).toEqual([1, 0, 0, 0, 0, 0, 2]);
    expect(buckets).toHaveLength(7);
  });

  it("ignores what falls outside the period or does not parse", () => {
    const buckets = trendBuckets([{ occurredAt: ago(8) }, { occurredAt: "nonsense" }], 7, NOW);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  it("groups ninety days into thirty three-day bars", () => {
    const buckets = trendBuckets([{ occurredAt: ago(0) }, { occurredAt: ago(2) }, { occurredAt: ago(3) }], 90, NOW);
    expect(buckets.at(-1)?.count).toBe(2);
    expect(buckets.at(-2)?.count).toBe(1);
  });
});

describe("the replay", () => {
  it("shows everything at a scrub of 0, and hides what is newer than the scrub day", () => {
    const [oldest, , today] = trendBuckets([], 3, NOW);
    expect(bucketShown(today, 0)).toBe(true);
    expect(bucketShown(today, 1)).toBe(false);
    expect(bucketShown(oldest, 2)).toBe(true);
  });

  it("has no cut-off at a scrub of 0, and the end of that day otherwise", () => {
    expect(untilForScrub(0, NOW)).toBeNull();
    const until = new Date(untilForScrub(2, NOW)!);
    expect(until.getDate()).toBe(new Date(NOW - 2 * DAY).getDate());
    expect([until.getHours(), until.getMinutes()]).toEqual([23, 59]);
  });

  it("steps about thirty times across any period", () => {
    expect(playStep(7)).toBe(1);
    expect(playStep(30)).toBe(1);
    expect(playStep(365)).toBe(12);
  });
});
