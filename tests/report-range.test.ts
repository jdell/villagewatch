import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The period behind `/reports` and the PDF route.
 *
 * `src/lib/reports.ts` is a server module and imports Prisma at the top, so the
 * client is stubbed at the boundary — `resolveReportRange` never touches it,
 * and the alternative is a resolver that cannot be tested without a database.
 * The same shape `rate-limit.test.ts` uses, and for the same reason.
 *
 * What is asserted is `?days=`, which is new, and the two things about it that
 * would fail quietly. Everything else here — the presets, the swap, the future
 * end date — is the behaviour `days` had to slot in beside without changing,
 * so a few of those are pinned too: this file is what would catch a `days`
 * branch that had accidentally taken the preset branch's place.
 */

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { resolveReportRange } = await import("@/lib/reports");
const { REPORT_MAX_RANGE_DAYS } = await import("@/lib/constants");

/** A fixed "now" — every assertion below is relative to it. */
const NOW = new Date("2026-08-04T12:00:00.000Z");

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between the two ends of a resolved range. */
function span(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

beforeEach(() => {
  vi.useRealTimers();
});

describe("resolveReportRange — ?days=", () => {
  it("covers exactly the number of days asked for", () => {
    const range = resolveReportRange({ days: "14" }, NOW);

    expect(span(range.from, range.to)).toBe(14);
    expect(range.days).toBe(14);
    expect(range.to).toEqual(NOW);
    expect(range.notice).toBeNull();
  });

  it("reports the matching preset, so the picker still highlights it", () => {
    // A URL that arrived as `?days=7` and a URL that arrived as `?range=7` are
    // the same period, and the page renders a `<select>` off `preset`. Falling
    // to "custom" here would leave "Custom range" selected above a form whose
    // date fields say something the coordinator never typed.
    expect(resolveReportRange({ days: "7" }, NOW).preset).toBe("7");
    expect(resolveReportRange({ days: "30" }, NOW).preset).toBe("30");
  });

  it("is the same period as the equivalent preset", () => {
    // The two branches compute `now - days` independently. If they ever drift,
    // a coordinator downloading `?days=30` gets a different month from the one
    // they are looking at under "Last 30 days" — and nothing on either screen
    // would say so.
    const byDays = resolveReportRange({ days: "30" }, NOW);
    const byPreset = resolveReportRange({ range: "30" }, NOW);

    expect(byDays.from).toEqual(byPreset.from);
    expect(byDays.to).toEqual(byPreset.to);
    expect(byDays.days).toBe(byPreset.days);
  });

  it("falls to custom for a span with no preset behind it", () => {
    expect(resolveReportRange({ days: "45" }, NOW).preset).toBe("custom");
  });

  it("clamps past the ceiling and says that it did", () => {
    // Clamped rather than refused: "give me five years" is unambiguous, and
    // silently falling back to a week would be a far shorter report with
    // nothing on it to admit the difference.
    const range = resolveReportRange({ days: "5000" }, NOW);

    expect(range.days).toBe(REPORT_MAX_RANGE_DAYS);
    expect(span(range.from, range.to)).toBe(REPORT_MAX_RANGE_DAYS);
    expect(range.notice).toMatch(/at most 365 days/);
  });

  it("wins over range, from and to when all four are present", () => {
    const range = resolveReportRange(
      { days: "7", range: "30", from: "2020-01-01", to: "2020-02-01" },
      NOW,
    );

    expect(range.days).toBe(7);
    expect(range.preset).toBe("7");
  });

  it("ignores anything that is not a positive whole number", () => {
    // Every one of these has to produce a period rather than throw: this runs
    // on a page render, and a hand-edited query string must not be an error
    // page in front of somebody who is late for a meeting.
    for (const days of ["0", "-7", "abc", "", "7.5", "1e9999", "NaN"]) {
      const range = resolveReportRange({ days }, NOW);

      expect(range.days).toBeGreaterThan(0);
      expect(Number.isNaN(range.from.getTime())).toBe(false);
      expect(Number.isNaN(range.to.getTime())).toBe(false);
    }

    // …and with nothing else in the query string, that means the default.
    expect(resolveReportRange({ days: "abc" }, NOW).preset).toBe("7");
    // A junk `days` does not swallow a good `range` beside it.
    expect(resolveReportRange({ days: "abc", range: "30" }, NOW).preset).toBe("30");
  });

  it("takes the first value when the parameter is repeated", () => {
    // `?days=7&days=30` reaches a page as an array. Next hands searchParams
    // through as `string | string[]`, and `single()` is what flattens it.
    expect(resolveReportRange({ days: ["7", "30"] }, NOW).days).toBe(7);
  });
});

describe("resolveReportRange — the branches days had to sit beside", () => {
  it("still defaults to the seven-day preset", () => {
    const range = resolveReportRange({}, NOW);

    expect(range.preset).toBe("7");
    expect(range.days).toBe(7);
  });

  it("still swaps a custom range that is the wrong way round", () => {
    const range = resolveReportRange(
      { range: "custom", from: "2026-07-31", to: "2026-07-01" },
      NOW,
    );

    expect(range.fromValue).toBe("2026-07-01");
    expect(range.toValue).toBe("2026-07-31");
    expect(range.notice).toMatch(/wrong way round/);
  });

  it("still pulls a future end date back to now", () => {
    const range = resolveReportRange(
      { range: "custom", from: "2026-08-01", to: "2027-01-01" },
      NOW,
    );

    expect(range.to).toEqual(NOW);
    expect(range.notice).toMatch(/in the future/);
  });
});
