import { describe, expect, it } from "vitest";
import type { Severity } from "@/generated/prisma/enums";
import {
  HEATMAP_CONFIG,
  HEATMAP_LEGEND_CSS,
  HEAT_SEVERITY_WEIGHT,
  recencyWeight,
  toHeatPoints,
} from "@/lib/heatmap";
import { SEVERITY_VALUES } from "@/lib/constants";

/**
 * The heat intensity scale.
 *
 * Worth pinning down for one reason: `leaflet.heat` clamps a cell's summed
 * intensity at `max`, which this scale assumes is 1. If a single point could
 * exceed 1 the gradient would saturate on one report and the map would stop
 * being a density map — every pin would be red, which is exactly the failure
 * mode that reads as "working" in a screenshot.
 *
 * What cannot be asserted here is the drawing. That is a canvas inside Leaflet
 * inside a browser, and the suite is node-only by design (see The test suite in
 * CLAUDE.md). What is assertable is the arithmetic the plugin is handed.
 */

const NOW = Date.UTC(2026, 6, 28, 12, 0, 0);
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(NOW - days * DAY_MS);
}

function incident(severity: Severity, days: number) {
  return { severity, occurredAt: daysAgo(days), lat: 52.2, lng: 0.1 };
}

describe("HEAT_SEVERITY_WEIGHT", () => {
  it("covers every severity in the schema", () => {
    // A severity added to the enum and not to the table would read as
    // `undefined` and produce a NaN intensity — a point that draws nothing, on
    // the map that exists to show it.
    for (const severity of SEVERITY_VALUES) {
      expect(typeof HEAT_SEVERITY_WEIGHT[severity]).toBe("number");
    }
  });

  it("rises with severity and tops out at 1", () => {
    const weights = SEVERITY_VALUES.map((s) => HEAT_SEVERITY_WEIGHT[s]);

    expect(weights).toEqual([...weights].sort((a, b) => a - b));
    expect(Math.max(...weights)).toBe(1);
    expect(Math.min(...weights)).toBeGreaterThan(0);
  });
});

describe("recencyWeight", () => {
  it("gives today full weight and decays through the anchors", () => {
    expect(recencyWeight(daysAgo(0), NOW)).toBeCloseTo(1);
    expect(recencyWeight(daysAgo(7), NOW)).toBeCloseTo(0.7);
    // The anchor itself, not the floor below it — see the note in
    // `recencyWeight` about why the boundary test is strict.
    expect(recencyWeight(daysAgo(30), NOW)).toBeCloseTo(0.3);
    expect(recencyWeight(daysAgo(31), NOW)).toBeCloseTo(0.1);
  });

  it("interpolates between the anchors rather than stepping", () => {
    const middle = recencyWeight(daysAgo(3.5), NOW);

    expect(middle).toBeLessThan(1);
    expect(middle).toBeGreaterThan(0.7);
    expect(middle).toBeCloseTo(0.85);
  });

  it("floors old reports instead of dropping them", () => {
    // "All time" has to keep meaning all time. A weight of zero would quietly
    // turn the range toggle into a filter that does nothing past a month.
    expect(recencyWeight(daysAgo(400), NOW)).toBeGreaterThan(0);
    expect(recencyWeight(daysAgo(400), NOW)).toBeCloseTo(0.1);
  });

  it("treats a future date as now, and an unparseable one as old", () => {
    // A phone clock a day out, or a reporter who typed tomorrow.
    expect(recencyWeight(new Date(NOW + DAY_MS), NOW)).toBeCloseTo(1);
    expect(recencyWeight("not a date", NOW)).toBeCloseTo(0.1);
  });
});

describe("toHeatPoints", () => {
  it("emits [lat, lng, intensity] in the order given", () => {
    const points = toHeatPoints([incident("HIGH", 0)], NOW);

    expect(points).toHaveLength(1);
    expect(points[0][0]).toBe(52.2);
    expect(points[0][1]).toBe(0.1);
    expect(points[0][2]).toBeCloseTo(0.8);
  });

  it("never produces an intensity above the layer's max", () => {
    const max = HEATMAP_CONFIG.max;

    for (const severity of SEVERITY_VALUES) {
      for (const days of [0, 1, 7, 30, 365]) {
        const [[, , intensity]] = toHeatPoints([incident(severity, days)], NOW);
        expect(intensity).toBeGreaterThan(0);
        expect(intensity).toBeLessThanOrEqual(max);
      }
    }
  });

  it("ranks a recent low-severity report below an old critical one only when the decay says so", () => {
    const [[, , freshLow]] = toHeatPoints([incident("LOW", 0)], NOW);
    const [[, , staleCritical]] = toHeatPoints([incident("CRITICAL", 400)], NOW);

    // 0.3 × 1.0 against 1.0 × 0.1 — today's minor report outweighs a year-old
    // serious one, which is the behaviour a *density* map wants: it is about
    // where things are happening now.
    expect(freshLow).toBeGreaterThan(staleCritical);
  });
});

describe("HEATMAP_CONFIG", () => {
  it("keeps every gradient stop inside 0..1", () => {
    const stops = Object.keys(HEATMAP_CONFIG.gradient).map(Number);

    expect(Math.min(...stops)).toBeGreaterThan(0);
    expect(Math.max(...stops)).toBeLessThanOrEqual(1);
  });

  it("lists the legend's stops in ascending order", () => {
    // The gradient object cannot be relied on for this: `1.0` is an
    // integer-like key, so JS enumerates it first and `Object.keys` comes back
    // as ["1", "0.3", "0.5", "0.7"]. Canvas sorts by offset and does not care;
    // CSS clamps a stop to the one before it, so an unsorted legend renders as
    // a solid red bar. See the note on `HEATMAP_LEGEND_CSS`.
    const percentages = [...HEATMAP_LEGEND_CSS.matchAll(/(\d+(?:\.\d+)?)%/g)].map(
      (match) => Number(match[1]),
    );

    expect(percentages.length).toBe(
      Object.keys(HEATMAP_CONFIG.gradient).length,
    );
    expect(percentages).toEqual([...percentages].sort((a, b) => a - b));
  });
});
