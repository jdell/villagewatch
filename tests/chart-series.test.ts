import { describe, expect, it } from "vitest";
import {
  buildSeries,
  bucketKey,
  bucketLabel,
  bucketStart,
  chooseGranularity,
} from "@/lib/charts/series";

/**
 * The arithmetic behind the Overview tab's trend chart.
 *
 * What makes this worth a test file rather than a careful read is that **every
 * failure in this module draws a plausible picture**. A chart with a week
 * missing from the middle of it does not look broken; it looks like a quiet
 * fortnight, on the screen a coordinator uses to tell a parish council whether
 * things are getting worse. Nothing downstream can catch it — Recharts will
 * happily plot whatever array it is handed, and the page renders either way.
 *
 * So the assertions here are about the two things that could be silently
 * wrong — which bucket a date lands in, and whether the empty buckets are
 * there at all — rather than about the shape of the return value.
 *
 * `bucketStart` is exercised against **Sundays** specifically. `getUTCDay()`
 * numbers Sunday 0, so the obvious `day - 1` shifts a Sunday *forward* into the
 * week it has just finished rather than back to the Monday it began on. One day
 * in seven, in the direction nobody checks.
 */

/** UTC, because that is the space the buckets are built in. */
function at(iso: string): Date {
  return new Date(`${iso}T12:00:00.000Z`);
}

describe("chooseGranularity", () => {
  it("moves at the boundaries the dashboard's own presets sit either side of", () => {
    // 7 and 30 are presets; 31 is the last day-sized period and 32 the first
    // week-sized one. The 90-day preset has to land on weeks and the 365-day
    // preset on months, or the axis is unreadable at the width a card has.
    expect(chooseGranularity(7)).toBe("day");
    expect(chooseGranularity(30)).toBe("day");
    expect(chooseGranularity(31)).toBe("day");
    expect(chooseGranularity(32)).toBe("week");
    expect(chooseGranularity(90)).toBe("week");
    expect(chooseGranularity(120)).toBe("week");
    expect(chooseGranularity(121)).toBe("month");
    expect(chooseGranularity(365)).toBe("month");
    // `MAX_CUSTOM_RANGE_DAYS`, the widest period anything can ask for.
    expect(chooseGranularity(730)).toBe("month");
  });

  it("treats an unbounded period as months rather than as an error", () => {
    // The dashboard does not offer one. If a caller ever passes one, months is
    // the only answer that cannot produce thousands of points.
    expect(chooseGranularity(null)).toBe("month");
  });
});

describe("bucketStart", () => {
  it("sends a Sunday back to the Monday its week began on", () => {
    // The regression this file exists for. 13 September 2026 is a Sunday and
    // belongs to the week beginning Monday the 7th; the naive form returns the
    // 14th, which is the Monday *after* it.
    expect(bucketKey(bucketStart(at("2026-09-13"), "week"))).toBe("2026-09-07");
  });

  it("leaves a Monday where it is", () => {
    expect(bucketKey(bucketStart(at("2026-09-07"), "week"))).toBe("2026-09-07");
  });

  it("puts every day of one week in the same bucket", () => {
    const days = [
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ];

    const keys = new Set(
      days.map((day) => bucketKey(bucketStart(at(day), "week"))),
    );

    expect([...keys]).toEqual(["2026-09-07"]);
  });

  it("truncates a month to its first, whatever day of the week that is", () => {
    // 1 February 2026 is itself a Sunday, which is the case that would break if
    // the month branch ever fell through to the week one.
    expect(bucketKey(bucketStart(at("2026-02-17"), "month"))).toBe("2026-02-01");
    expect(bucketKey(bucketStart(at("2026-02-01"), "month"))).toBe("2026-02-01");
  });

  it("keeps a day as itself", () => {
    expect(bucketKey(bucketStart(at("2026-09-13"), "day"))).toBe("2026-09-13");
  });
});

describe("bucketLabel", () => {
  it("says a week is a week rather than printing a bare date", () => {
    // A naked "7 Sept" over a column covering seven days invites the whole
    // column to be read as that Monday's reports.
    //
    // "Sept" rather than "Sep" is `en-GB`'s own abbreviation and is the British
    // form — the same locale `src/lib/format.ts` renders every other date on
    // these screens in, which is what stops one card saying "Sep" and the card
    // beside it "Sept".
    expect(bucketLabel(at("2026-09-07"), "week")).toBe("w/c 7 Sept");
    expect(bucketLabel(at("2026-09-07"), "day")).toBe("7 Sept");
    expect(bucketLabel(at("2026-09-01"), "month")).toBe("Sept 2026");
  });
});

describe("buildSeries", () => {
  it("puts a zero in every bucket the database returned nothing for", () => {
    /*
      The whole reason this module exists. `GROUP BY date_trunc(...)` returns no
      row for an empty bucket, so a fortnight with nothing in it arrives as
      absent rather than as zero — and a line chart joins the points either
      side of it, drawing steady activity across a period when nothing was
      reported.
    */
    const series = buildSeries({
      from: at("2026-09-01"),
      to: at("2026-09-05"),
      granularity: "day",
      counts: new Map([
        ["2026-09-01", 2],
        ["2026-09-05", 1],
      ]),
    });

    expect(series.map((bucket) => bucket.count)).toEqual([2, 0, 0, 0, 1]);
    expect(series.map((bucket) => bucket.key)).toEqual([
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
    ]);
  });

  it("covers the period even when nothing at all was reported", () => {
    const series = buildSeries({
      from: at("2026-09-01"),
      to: at("2026-09-03"),
      granularity: "day",
      counts: new Map(),
    });

    // Three zeroes rather than an empty array: a quiet week is a fact about the
    // village and should draw a flat line along the bottom, not an empty card.
    expect(series).toHaveLength(3);
    expect(series.every((bucket) => bucket.count === 0)).toBe(true);
  });

  it("ignores a count for a bucket outside the period", () => {
    // The axis is built from the period and the counts are looked up into it,
    // never the other way round — so a stray row cannot widen a chart past the
    // dates its own heading names.
    const series = buildSeries({
      from: at("2026-09-01"),
      to: at("2026-09-02"),
      granularity: "day",
      counts: new Map([
        ["2026-09-01", 1],
        ["2026-08-01", 99],
      ]),
    });

    expect(series).toHaveLength(2);
    expect(series.some((bucket) => bucket.count === 99)).toBe(false);
  });

  it("includes the bucket the period ends inside", () => {
    // The period ends mid-month, and that month is still a month with reports
    // in it. Truncating the end instead would silently drop the most recent
    // bucket — the one a coordinator is actually looking at.
    const series = buildSeries({
      from: at("2026-07-15"),
      to: at("2026-09-20"),
      granularity: "month",
      counts: new Map([["2026-09-01", 4]]),
    });

    expect(series.map((bucket) => bucket.key)).toEqual([
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ]);
    expect(series.at(-1)?.count).toBe(4);
  });

  it("steps over a month boundary rather than adding thirty days", () => {
    // `setUTCMonth(+1)` against a naive 30-day step: the second is what makes a
    // series drift, landing in February twice and skipping a month by June.
    const series = buildSeries({
      from: at("2026-01-31"),
      to: at("2026-05-01"),
      granularity: "month",
      counts: new Map(),
    });

    expect(series.map((bucket) => bucket.key)).toEqual([
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
    ]);
  });

  it("terminates on a period far wider than anything the app offers", () => {
    // A ceiling rather than a throw: a chart is furniture on a page that has to
    // render, and a caller with a nonsense range should cost a short axis
    // rather than an error page.
    const series = buildSeries({
      from: at("1990-01-01"),
      to: at("2090-01-01"),
      granularity: "day",
      counts: new Map(),
    });

    expect(series.length).toBeLessThanOrEqual(400);
  });
});
