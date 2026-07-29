import { describe, expect, it } from "vitest";
import {
  BROWSE_RANGE_VALUES,
  DASHBOARD_RANGE_VALUES,
  DEFAULT_TIME_RANGE,
  MAX_CUSTOM_RANGE_DAYS,
} from "@/lib/constants";
import {
  previousPeriod,
  resolveTimeRange,
  timeRangeFilter,
  timeRangeParams,
  withinTimeRange,
} from "@/lib/date-range";

/**
 * The period behind `/map`, `/incidents` and `/dashboard`.
 *
 * One resolver for three surfaces, which is what makes it worth pinning down:
 * a change here moves the map's pins, the list's query and the dashboard's stat
 * cards at once. Two properties carry most of the weight.
 *
 * **Nothing rejects.** This runs on a page render, so every branch — junk in the
 * query string, half a custom range, dates the wrong way round — has to produce
 * a period rather than an exception. A throw here is an error page in front of
 * somebody looking at a map.
 *
 * **Unbounded means absent, not zero.** `all` has to contribute no `occurredAt`
 * key to a Prisma filter at all. A `{ gte: undefined }` would work today and is
 * one Prisma release from meaning something else.
 *
 * The clock is passed in everywhere. A test that read the real one would be a
 * test that failed at midnight.
 */

const NOW = new Date(Date.UTC(2026, 6, 28, 12, 0, 0));
const DAY_MS = 24 * 60 * 60 * 1000;

describe("resolveTimeRange — presets", () => {
  it("resolves a preset to a window ending now", () => {
    const range = resolveTimeRange({ range: "7" }, { now: NOW });

    expect(range.preset).toBe("7");
    expect(range.days).toBe(7);
    expect(range.to).toEqual(NOW);
    expect(range.from?.getTime()).toBe(NOW.getTime() - 7 * DAY_MS);
    expect(range.notice).toBeNull();
  });

  it("defaults to thirty days when the query string is empty", () => {
    const range = resolveTimeRange({}, { now: NOW });

    expect(range.preset).toBe(DEFAULT_TIME_RANGE);
    expect(range.days).toBe(30);
  });

  it("falls back to the default rather than throwing on junk", () => {
    // A stale bookmark or a hand-edited URL. The schema `.catch()`es, and what
    // matters is that this returns a usable period at all.
    const range = resolveTimeRange(
      { range: "../../etc/passwd" },
      { now: NOW },
    );

    expect(range.preset).toBe(DEFAULT_TIME_RANGE);
    expect(range.from).not.toBeNull();
  });

  it("takes the first value when a key is repeated", () => {
    const range = resolveTimeRange({ range: ["7", "30"] }, { now: NOW });

    expect(range.preset).toBe("7");
  });

  it("ignores a preset the surface does not offer", () => {
    // `90` is a real preset, but not one the map or the list renders. Honouring
    // it would put "Last 30 days" on the control over ninety days of data.
    const range = resolveTimeRange(
      { range: "90" },
      { allowed: BROWSE_RANGE_VALUES, now: NOW },
    );

    expect(range.preset).toBe(DEFAULT_TIME_RANGE);
    expect(range.days).toBe(30);
  });

  it("offers ninety days where the dashboard asks for it", () => {
    const range = resolveTimeRange(
      { range: "90" },
      { allowed: DASHBOARD_RANGE_VALUES, now: NOW },
    );

    expect(range.preset).toBe("90");
    expect(range.days).toBe(90);
  });

  it("ignores `all` on the dashboard, which does not offer it", () => {
    const range = resolveTimeRange(
      { range: "all" },
      { allowed: DASHBOARD_RANGE_VALUES, now: NOW },
    );

    expect(range.preset).toBe(DEFAULT_TIME_RANGE);
    expect(range.from).not.toBeNull();
  });
});

describe("resolveTimeRange — all time", () => {
  it("is unbounded at both ends", () => {
    const range = resolveTimeRange({ range: "all" }, { now: NOW });

    expect(range.from).toBeNull();
    expect(range.to).toBeNull();
    expect(range.days).toBeNull();
  });

  it("still seeds the date inputs, so Custom does not open blank", () => {
    const range = resolveTimeRange({ range: "all" }, { now: NOW });

    expect(range.fromValue).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(range.toValue).toBe("2026-07-28");
  });
});

describe("resolveTimeRange — custom", () => {
  it("includes both days the reader picked", () => {
    const range = resolveTimeRange(
      { range: "custom", from: "2026-07-01", to: "2026-07-07" },
      { now: NOW },
    );

    expect(range.preset).toBe("custom");
    // The end is pushed to the close of the chosen day. A naive midnight
    // boundary would drop every report filed on the last afternoon.
    expect(range.to?.getHours()).toBe(23);
    expect(range.days).toBe(7);
    expect(range.notice).toBeNull();
  });

  it("swaps dates the wrong way round and says so", () => {
    const range = resolveTimeRange(
      { range: "custom", from: "2026-07-07", to: "2026-07-01" },
      { now: NOW },
    );

    expect(range.from!.getTime()).toBeLessThan(range.to!.getTime());
    expect(range.notice).toMatch(/wrong way round/i);
  });

  it("clamps an end date in the future to now", () => {
    const range = resolveTimeRange(
      { range: "custom", from: "2026-07-01", to: "2027-01-01" },
      { now: NOW },
    );

    expect(range.to).toEqual(NOW);
    expect(range.notice).toMatch(/future/i);
  });

  it("moves the start when the span exceeds the ceiling", () => {
    const range = resolveTimeRange(
      { range: "custom", from: "2000-01-01", to: "2026-07-28" },
      { now: NOW },
    );

    const span = range.to!.getTime() - range.from!.getTime();

    expect(span).toBeLessThanOrEqual(MAX_CUSTOM_RANGE_DAYS * DAY_MS);
    expect(range.notice).toMatch(/at most/i);
  });

  it("falls back to a window when only one date is given", () => {
    // Half a range is a form somebody is still filling in, not an instruction.
    const range = resolveTimeRange(
      { range: "custom", from: "2026-07-01" },
      { now: NOW },
    );

    expect(range.from).not.toBeNull();
    expect(range.to).toEqual(NOW);
    expect(range.notice).toMatch(/both/i);
  });

  it("says nothing when neither date is given", () => {
    // Pressing "Custom range" with empty inputs is not a mistake to report.
    const range = resolveTimeRange({ range: "custom" }, { now: NOW });

    expect(range.notice).toBeNull();
    expect(range.days).toBe(30);
  });

  it("hands back the dates it was given, unmoved", () => {
    // The regression this exists for. `to` is parsed as host-zone midnight and
    // was formatted back in `Europe/London`, so on a UTC host — every Vercel
    // lambda — "2026-07-07T23:59:59.999" came back as 2026-07-08 and walked
    // forward another day on every submission. It passed on a British laptop
    // and failed in CI.
    const range = resolveTimeRange(
      { range: "custom", from: "2026-07-01", to: "2026-07-07" },
      { now: NOW },
    );

    expect(range.fromValue).toBe("2026-07-01");
    expect(range.toValue).toBe("2026-07-07");
  });

  it("is stable when its own output is fed back in", () => {
    // What the form actually does: renders `fromValue`/`toValue` into the two
    // inputs, which are submitted again on the next press. A range that drifts
    // one day per submission is the failure mode above, seen from the form's
    // side rather than the resolver's.
    let range = resolveTimeRange(
      { range: "custom", from: "2026-06-15", to: "2026-07-07" },
      { now: NOW },
    );

    for (let pass = 0; pass < 3; pass += 1) {
      range = resolveTimeRange(
        { range: "custom", from: range.fromValue, to: range.toValue },
        { now: NOW },
      );
    }

    expect(range.fromValue).toBe("2026-06-15");
    expect(range.toValue).toBe("2026-07-07");
  });

  it("does not throw on a malformed date", () => {
    const range = resolveTimeRange(
      { range: "custom", from: "not-a-date", to: "2026-07-07" },
      { now: NOW },
    );

    expect(range.from).not.toBeNull();
    expect(range.to).not.toBeNull();
  });
});

describe("timeRangeFilter", () => {
  it("omits `occurredAt` entirely for an unbounded range", () => {
    const filter = timeRangeFilter(
      resolveTimeRange({ range: "all" }, { now: NOW }),
    );

    // Not `{ occurredAt: { gte: undefined } }` — the key has to be absent.
    expect(Object.hasOwn(filter, "occurredAt")).toBe(false);
  });

  it("carries both bounds for a bounded range", () => {
    const range = resolveTimeRange({ range: "7" }, { now: NOW });
    const filter = timeRangeFilter(range);

    expect(filter.occurredAt?.gte).toEqual(range.from);
    expect(filter.occurredAt?.lte).toEqual(range.to);
  });
});

describe("previousPeriod", () => {
  it("is the same length, ending where this one starts", () => {
    const range = resolveTimeRange({ range: "7" }, { now: NOW });
    const previous = previousPeriod(range)!;

    expect(previous.lt).toEqual(range.from);
    expect(previous.lt.getTime() - previous.gte.getTime()).toBe(7 * DAY_MS);
  });

  it("is null for an unbounded range", () => {
    // There is nothing before all time. A trend arrow drawn from a comparison
    // that cannot exist is worse than no arrow.
    const range = resolveTimeRange({ range: "all" }, { now: NOW });

    expect(previousPeriod(range)).toBeNull();
  });
});

describe("withinTimeRange", () => {
  const range = resolveTimeRange({ range: "7" }, { now: NOW });

  it("keeps an incident inside the window", () => {
    expect(withinTimeRange(new Date(NOW.getTime() - DAY_MS), range)).toBe(true);
  });

  it("drops one before it", () => {
    expect(withinTimeRange(new Date(NOW.getTime() - 8 * DAY_MS), range)).toBe(
      false,
    );
  });

  it("keeps everything when the range is unbounded", () => {
    const all = resolveTimeRange({ range: "all" }, { now: NOW });

    expect(withinTimeRange(new Date(0), all)).toBe(true);
  });

  it("keeps an incident whose date cannot be read", () => {
    // A pin that cannot be dated is a pin the filter has no opinion about.
    // Dropping it would silently shrink the map on bad data.
    expect(withinTimeRange("not a date", range)).toBe(true);
  });
});

describe("timeRangeParams", () => {
  it("carries the preset alone", () => {
    const range = resolveTimeRange({ range: "7" }, { now: NOW });

    expect(timeRangeParams(range)).toEqual({ range: "7" });
  });

  it("carries the dates only for a custom range", () => {
    // A stale pair on a preset URL would drop the next reader who pressed
    // Custom into somebody else's fortnight.
    const range = resolveTimeRange(
      { range: "custom", from: "2026-07-01", to: "2026-07-07" },
      { now: NOW },
    );

    expect(timeRangeParams(range)).toEqual({
      range: "custom",
      from: "2026-07-01",
      to: "2026-07-07",
    });
  });
});
