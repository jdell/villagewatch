import { describe, expect, it } from "vitest";
import {
  boundsKey,
  clampSelection,
  dayAt,
  daysBetween,
  fullSelection,
  isFullSelection,
  selectionLabel,
  timelineBounds,
  withinSelection,
} from "@/lib/timeline";

/**
 * The map's timeline slider, without the slider.
 *
 * Every failure here draws a *plausible* map rather than a broken one — a
 * report counted on the wrong side of a handle, a track one day short — which
 * is why it is tested rather than looked at. Dates are built with the local
 * constructor throughout, matching the module: a position on the track is a
 * calendar day in the host zone, not an instant.
 */

const NOW = new Date(2026, 8, 30, 15, 0); // 30 Sep 2026, 15:00 local

const iso = (y: number, m: number, d: number, h = 12, min = 0) =>
  new Date(y, m, d, h, min).toISOString();

describe("timelineBounds", () => {
  it("runs from the period's first day to its last, inclusive", () => {
    const bounds = timelineBounds(
      { from: new Date(2026, 8, 1), to: new Date(2026, 8, 30, 23, 59, 59, 999) },
      [],
      NOW,
    );

    expect(bounds.start).toEqual(new Date(2026, 8, 1));
    expect(bounds.days).toBe(30);
  });

  it("starts `all` on the earliest report's day, and ends today", () => {
    const bounds = timelineBounds(
      { from: null, to: null },
      [iso(2026, 8, 20), iso(2026, 7, 3, 21), "not a date", iso(2026, 8, 1)],
      NOW,
    );

    expect(bounds.start).toEqual(new Date(2026, 7, 3));
    expect(dayAt(bounds.start, bounds.days - 1)).toEqual(new Date(2026, 8, 30));
  });

  it("is one day, today, for `all` with nothing in it", () => {
    const bounds = timelineBounds({ from: null, to: null }, [], NOW);

    expect(bounds).toEqual({ start: new Date(2026, 8, 30), days: 1 });
  });

  it("pulls an end in the future back to today", () => {
    const bounds = timelineBounds(
      { from: new Date(2026, 8, 25), to: new Date(2026, 9, 10) },
      [],
      NOW,
    );

    expect(bounds.days).toBe(6); // 25–30 Sep
  });

  it("never produces an empty track", () => {
    const bounds = timelineBounds(
      { from: new Date(2026, 9, 5), to: new Date(2026, 9, 10) },
      [],
      NOW,
    );

    expect(bounds.days).toBe(1);
  });
});

describe("day arithmetic across the clocks going back", () => {
  // 25 October 2026 is the last Sunday of October, when the UK leaves BST.
  // The assertions are written in calendar days, so they hold in any host zone
  // — and in one with a clock change they are what catches a 24-hour step.
  it("steps by calendar day, landing on midnight every time", () => {
    const start = new Date(2026, 9, 20);

    for (let offset = 0; offset < 10; offset += 1) {
      const day = dayAt(start, offset);
      expect(day.getHours()).toBe(0);
      expect(day.getDate()).toBe(new Date(2026, 9, 20 + offset).getDate());
    }
  });

  it("counts a 25-hour day as one day", () => {
    expect(daysBetween(new Date(2026, 9, 24), new Date(2026, 9, 27))).toBe(3);
  });
});

describe("withinSelection", () => {
  const bounds = timelineBounds(
    { from: new Date(2026, 8, 1), to: new Date(2026, 8, 30) },
    [],
    NOW,
  );
  // 10–12 September.
  const within = withinSelection(bounds, { from: 9, to: 11 });

  it("includes the first day from its midnight", () => {
    expect(within(iso(2026, 8, 10, 0, 0))).toBe(true);
    expect(within(iso(2026, 8, 9, 23, 59))).toBe(false);
  });

  it("includes the last day until its end, and not the next midnight", () => {
    expect(within(iso(2026, 8, 12, 23, 59))).toBe(true);
    expect(within(iso(2026, 8, 13, 0, 0))).toBe(false);
  });

  it("keeps a row it cannot parse rather than hiding it", () => {
    expect(within("not a date")).toBe(true);
  });

  it("filters nothing out at the full selection", () => {
    const all = withinSelection(bounds, fullSelection(bounds));

    expect(all(iso(2026, 8, 1, 0, 0))).toBe(true);
    expect(all(iso(2026, 8, 30, 23, 59))).toBe(true);
  });
});

describe("clampSelection", () => {
  const bounds = { start: new Date(2026, 8, 1), days: 30 };

  it("stops a dragged start handle at the end handle rather than swapping", () => {
    expect(clampSelection(bounds, { from: 20, to: 12 }, "from")).toEqual({
      from: 12,
      to: 12,
    });
  });

  it("stops a dragged end handle at the start handle rather than swapping", () => {
    expect(clampSelection(bounds, { from: 20, to: 12 }, "to")).toEqual({
      from: 20,
      to: 20,
    });
  });

  it("keeps both handles on the track", () => {
    expect(clampSelection(bounds, { from: -4, to: 99 })).toEqual({
      from: 0,
      to: 29,
    });
  });
});

describe("isFullSelection", () => {
  const bounds = { start: new Date(2026, 8, 1), days: 30 };

  it("is true only when both handles are at the ends", () => {
    expect(isFullSelection(bounds, fullSelection(bounds))).toBe(true);
    expect(isFullSelection(bounds, { from: 1, to: 29 })).toBe(false);
    expect(isFullSelection(bounds, { from: 0, to: 28 })).toBe(false);
  });
});

describe("selectionLabel", () => {
  // August rather than September, as in `calendar.test.ts`: en-GB abbreviates
  // September as "Sept" on current ICU and "Sep" on older ones, and this is a
  // test of which days are named rather than of the runtime's month table.
  const bounds = { start: new Date(2026, 7, 1), days: 31 };

  it("reads as the chip does — no year inside the current one", () => {
    expect(selectionLabel(bounds, { from: 14, to: 21 }, NOW)).toBe(
      "15 Aug – 22 Aug",
    );
  });

  it("renders one day as one date", () => {
    expect(selectionLabel(bounds, { from: 4, to: 4 }, NOW)).toBe("5 Aug");
  });
});

describe("boundsKey", () => {
  it("changes when the period does, so a stale selection is discarded", () => {
    const month = { start: new Date(2026, 8, 1), days: 30 };
    const week = { start: new Date(2026, 8, 24), days: 7 };

    expect(boundsKey(month)).not.toBe(boundsKey(week));
    expect(boundsKey(month)).toBe(boundsKey({ ...month }));
  });
});
