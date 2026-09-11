import { describe, expect, it } from "vitest";
import {
  SEVERITY_RING_HEIGHT,
  severityChartHeight,
  typeChartHeight,
} from "@/components/charts/chart-data";

/**
 * How tall a chart card reserves for itself.
 *
 * This exists because getting it wrong shipped: the severity doughnut's key
 * rendered *outside* its card and over the panel below it on any screen
 * narrower than `sm`. The ring was `h-full`, so when the two stopped sitting
 * side by side it took the whole reserved box and the key was laid out past the
 * end of it — 103px outside the card, overlapping the next one by 87px.
 *
 * It was invisible at desktop width, which is where it was checked.
 *
 * What can be asserted here is the arithmetic; what cannot is that the
 * constants behind it match what the browser actually draws. Those were
 * measured against the rendered component — a legend row is 20px with an 8px
 * gap between rows — and the property they buy is `reserved === content`, which
 * only a browser can confirm. **Measure again rather than adjusting these to
 * make a number look rounder.**
 */

describe("severityChartHeight", () => {
  it("reserves the ring alone when there is nothing to key", () => {
    // Every level dropped means an empty period, and the frame renders its
    // empty message rather than a chart — but a card that had briefly reserved
    // room for a key with no rows in it would still be wrong.
    expect(severityChartHeight(0)).toBe(SEVERITY_RING_HEIGHT);
  });

  it("adds the key's own height once it stacks under the ring", () => {
    // One row: the ring, the gap, and a single 20px line — no row gap, because
    // there is nothing to gap against.
    expect(severityChartHeight(1)).toBe(SEVERITY_RING_HEIGHT + 16 + 20);
  });

  it("counts the gaps between rows rather than one per row", () => {
    /*
      `space-y-2` puts a gap *between* rows, so four rows carry three of them.
      Counting one per row over-reserves by exactly one gap — harmless on screen
      and wrong, and the sort of thing that gets "simplified" back later.
    */
    expect(severityChartHeight(4)).toBe(SEVERITY_RING_HEIGHT + 16 + 4 * 20 + 3 * 8);

    // Stated as the difference too, which is what a careless rewrite changes.
    const oneMoreRow = severityChartHeight(3) - severityChartHeight(2);
    expect(oneMoreRow).toBe(28);
  });

  it("never reserves less than the ring, whatever it is asked", () => {
    // The four severities are the only real inputs; this is the guard for a
    // caller that passes something odd rather than a claim about the data.
    for (const rows of [0, 1, 2, 3, 4]) {
      expect(severityChartHeight(rows)).toBeGreaterThanOrEqual(
        SEVERITY_RING_HEIGHT,
      );
    }
  });

  it("grows with every row it is given", () => {
    const heights = [1, 2, 3, 4].map(severityChartHeight);

    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(new Set(heights).size).toBe(heights.length);
  });
});

describe("typeChartHeight", () => {
  it("grows with its rows rather than squeezing them", () => {
    /*
      The category chart's own version of the same rule, and the reason it has
      one: `IncidentType` has seventeen members, and at a fixed height each bar
      gets four pixels and the labels overlap — which a charting library does
      without complaining.
    */
    expect(typeChartHeight(2)).toBeLessThan(typeChartHeight(6));
    expect(typeChartHeight(6)).toBeLessThan(typeChartHeight(17));

    const perRow = typeChartHeight(6) - typeChartHeight(5);
    expect(perRow).toBeGreaterThan(0);
    // Every row costs the same, so the chart cannot quietly compress a long
    // breakdown into the space a short one needed.
    expect(typeChartHeight(10) - typeChartHeight(9)).toBe(perRow);
  });
});
