import { describe, expect, it } from "vitest";
import {
  PATTERN_RADIUS_METERS,
  PATTERN_WINDOW_DAYS,
} from "@/lib/ai/detect-patterns";
import { PIN_HEAT, PIN_SOFT } from "@/lib/map/glyph-pin";
import {
  MAP_PATTERN_RADIUS_METERS,
  MAP_PATTERN_WINDOW_DAYS,
  metresBetween,
  patternMembers,
} from "@/lib/map/pattern";
import { SEVERITY_VALUES } from "@/lib/constants";

/**
 * The modern incident sheet's pure parts: which reports "Show" frames, and the
 * severity badge's colours.
 */

const DAY = 24 * 3600_000;
const NOW = Date.UTC(2026, 9, 3, 12);

function incident(over: Record<string, unknown> = {}) {
  return {
    id: "a",
    type: "VEHICLE_CRIME" as const,
    occurredAt: new Date(NOW).toISOString(),
    lat: 52.2558,
    lng: 0.1032,
    recurring: true,
    ...over,
  };
}

describe("the pattern rule", () => {
  it("is the detector's own radius and window, repeated because that module reads the database", () => {
    expect(MAP_PATTERN_RADIUS_METERS).toBe(PATTERN_RADIUS_METERS);
    expect(MAP_PATTERN_WINDOW_DAYS).toBe(PATTERN_WINDOW_DAYS);
  });

  it("measures metres sensibly at village scale", () => {
    // 0.001° of latitude is ~111m anywhere.
    expect(metresBetween({ lat: 52.25, lng: 0.1 }, { lat: 52.251, lng: 0.1 })).toBeCloseTo(111.2, 0);
  });

  it("puts the selected report first, then recurring ones of the same kind nearby and recently", () => {
    const selected = incident();
    const near = incident({ id: "b", lat: 52.2551, lng: 0.1043 }); // ~110m
    const far = incident({ id: "c", lat: 52.26, lng: 0.11 }); // ~600m
    const otherType = incident({ id: "d", type: "BURGLARY", lat: 52.2557 });
    const notRecurring = incident({ id: "e", recurring: false, lat: 52.2557 });
    const old = incident({ id: "f", lat: 52.2557, occurredAt: new Date(NOW - 40 * DAY).toISOString() });

    expect(
      patternMembers(selected, [selected, near, far, otherType, notRecurring, old]).map((i) => i.id),
    ).toEqual(["a", "b"]);
  });
});

describe("the severity badge", () => {
  // WCAG relative luminance and contrast ratio.
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const contrast = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  it("has text that clears 4.5:1 on its wash, for every severity", () => {
    for (const severity of SEVERITY_VALUES) {
      const { bg, text } = PIN_SOFT[severity];
      expect(contrast(text, bg), severity).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses the pin's own colour for its dot", () => {
    expect(Object.keys(PIN_SOFT).sort()).toEqual(Object.keys(PIN_HEAT).sort());
  });
});
