import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAP_FILTERS,
  MODERN_MAP_PERIODS,
  PRIMARY_MAP_TYPES,
  activeFilterCount,
  applyMapFilters,
  summaryLine,
  toggleValue,
  type FilterableIncident,
  type MapFilters,
} from "@/lib/map/filters";
import { INCIDENT_TYPE_VALUES, TIME_RANGES } from "@/lib/constants";

/**
 * The modern map's filters — one function behind the pill's count, the filter
 * button's badge, the sheet's "Show 18 reports" and the pins. If these agree
 * with each other it is because they are this module.
 */

const NOW = Date.UTC(2026, 9, 3, 12);
const DAY = 24 * 60 * 60 * 1000;

function incident(over: Partial<FilterableIncident> & { daysAgo?: number } = {}) {
  const { daysAgo = 1, ...rest } = over;
  return {
    type: "THEFT",
    severity: "LOW",
    occurredAt: new Date(NOW - daysAgo * DAY).toISOString(),
    recurring: false,
    status: "PUBLISHED",
    ...rest,
  } as FilterableIncident;
}

const filters = (over: Partial<MapFilters> = {}): MapFilters => ({
  ...DEFAULT_MAP_FILTERS,
  ...over,
});

describe("the periods", () => {
  it("are all real TIME_RANGES presets, so the pill and the classic map mean the same span", () => {
    const presets = TIME_RANGES.map((range) => range.value as string);
    for (const period of MODERN_MAP_PERIODS) {
      expect(presets).toContain(period.value);
      expect(TIME_RANGES.find((r) => r.value === period.value)?.days).toBe(
        period.days,
      );
    }
  });

  it("drops what is older than the period and keeps what is inside it", () => {
    const rows = [incident({ daysAgo: 3 }), incident({ daysAgo: 20 }), incident({ daysAgo: 40 })];
    expect(applyMapFilters(rows, filters({ period: "7" }), NOW)).toHaveLength(1);
    expect(applyMapFilters(rows, filters({ period: "30" }), NOW)).toHaveLength(2);
    expect(applyMapFilters(rows, filters({ period: "90" }), NOW)).toHaveLength(3);
  });

  it("drops a row whose date does not parse rather than keeping it on the map", () => {
    expect(
      applyMapFilters([incident({ occurredAt: "not a date" })], filters(), NOW),
    ).toHaveLength(0);
  });
});

describe("the narrowing filters", () => {
  const rows = [
    incident({ type: "BURGLARY", severity: "HIGH" }),
    incident({ type: "THEFT", severity: "LOW", recurring: true }),
    incident({ type: "THEFT", severity: "HIGH", status: "RESOLVED" }),
  ];

  it("treats an empty category or severity list as everything", () => {
    expect(applyMapFilters(rows, filters(), NOW)).toHaveLength(3);
  });

  it("narrows by category and by severity together", () => {
    expect(
      applyMapFilters(rows, filters({ types: ["THEFT"], severities: ["HIGH"] }), NOW),
    ).toHaveLength(1);
  });

  it("hides resolved reports only when asked", () => {
    expect(
      applyMapFilters(rows, filters({ showResolved: false }), NOW).every(
        (row) => row.status !== "RESOLVED",
      ),
    ).toBe(true);
  });

  it("keeps only recurring reports under 'patterns only'", () => {
    expect(applyMapFilters(rows, filters({ patternsOnly: true }), NOW)).toEqual([
      rows[1],
    ]);
  });
});

describe("the badge and the pill", () => {
  it("counts everything but the period, which is always set", () => {
    expect(activeFilterCount(DEFAULT_MAP_FILTERS)).toBe(0);
    expect(activeFilterCount(filters({ period: "7" }))).toBe(0);
    expect(
      activeFilterCount(
        filters({
          types: ["THEFT", "BURGLARY"],
          severities: ["HIGH"],
          showResolved: false,
          patternsOnly: true,
        }),
      ),
    ).toBe(5);
  });

  it("says how many and over what, in the singular when there is one", () => {
    expect(summaryLine(25, "30")).toBe("25 reports · last 30 days");
    expect(summaryLine(1, "365")).toBe("1 report · last 12 months");
  });

  it("toggles a chip in and out", () => {
    expect(toggleValue(["A"], "B")).toEqual(["A", "B"]);
    expect(toggleValue(["A", "B"], "A")).toEqual(["B"]);
  });

  it("only offers real categories before the fold", () => {
    for (const type of PRIMARY_MAP_TYPES) {
      expect(INCIDENT_TYPE_VALUES).toContain(type);
    }
  });
});
