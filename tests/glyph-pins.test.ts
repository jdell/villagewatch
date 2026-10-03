import { describe, expect, it } from "vitest";
import { INCIDENT_TYPES, SEVERITY_VALUES } from "@/lib/constants";
import type { IncidentIconName } from "@/lib/constants";
import {
  PIN_GLYPH_COLOR,
  PIN_HEAT,
  glyphEventPin,
  glyphPin,
  pinState,
  pinZIndex,
  type GlyphPinInput,
} from "@/lib/map/glyph-pin";
import { GLYPH_NODES, STATE_GLYPHS, iconSvg } from "@/lib/map/glyphs";

/**
 * The modern map's glyph-disc pins.
 *
 * The glyphs are read from lucide-react's own icon modules, which is not its
 * public API — so the first thing asserted is that every one of them loads and
 * has shapes in it. An upgrade that moves the files fails here rather than
 * drawing seventeen empty discs.
 */

const NOW = Date.UTC(2026, 9, 3, 12);
const HOUR = 3600_000;

function pin(over: Partial<GlyphPinInput> & { hoursAgo?: number } = {}): GlyphPinInput {
  const { hoursAgo = 48, ...rest } = over;
  return {
    type: "BURGLARY",
    severity: "HIGH",
    occurredAt: new Date(NOW - hoursAgo * HOUR).toISOString(),
    recurring: false,
    ...rest,
  };
}

describe("the glyphs", () => {
  it("has a drawing for every incident type's icon", () => {
    for (const type of INCIDENT_TYPES) {
      const node = GLYPH_NODES[type.icon as IncidentIconName];
      expect(node, type.value).toBeDefined();
      expect(node.length, type.value).toBeGreaterThan(0);
    }
  });

  it("loads the state glyphs", () => {
    for (const node of Object.values(STATE_GLYPHS)) {
      expect(node.length).toBeGreaterThan(0);
    }
  });

  it("renders an SVG at the size and colour asked for, without lucide's React keys", () => {
    const svg = iconSvg(GLYPH_NODES.DoorOpen, 16, "#fff", 2.25);
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('width="16"');
    expect(svg).toContain('stroke="#fff"');
    expect(svg).toContain('stroke-width="2.25"');
    expect(svg).toContain("<path ");
    expect(svg).not.toContain("key=");
  });

  it("escapes a colour rather than letting it close the attribute", () => {
    expect(iconSvg(GLYPH_NODES.Eye, 10, '"><script>')).not.toContain("<script>");
  });
});

describe("the fill", () => {
  it("is the brief's heat ramp, LOW to CRITICAL", () => {
    expect(PIN_HEAT).toEqual({
      LOW: "#eab308",
      MEDIUM: "#f97316",
      HIGH: "#ef4444",
      CRITICAL: "#991b1b",
    });
    for (const severity of SEVERITY_VALUES) {
      expect(glyphPin(pin({ severity }), NOW).html).toContain(PIN_HEAT[severity]);
    }
  });

  it("puts a dark glyph on the two light fills, where white would be illegible", () => {
    expect(PIN_GLYPH_COLOR.LOW).not.toBe("#ffffff");
    expect(PIN_GLYPH_COLOR.MEDIUM).not.toBe("#ffffff");
    expect(PIN_GLYPH_COLOR.HIGH).toBe("#ffffff");
    expect(PIN_GLYPH_COLOR.CRITICAL).toBe("#ffffff");
  });
});

describe("the states", () => {
  it("is 32px this week, 26px older and 24px resolved", () => {
    expect(glyphPin(pin({ hoursAgo: 48 }), NOW).size).toBe(32);
    expect(glyphPin(pin({ hoursAgo: 24 * 20 }), NOW).size).toBe(26);
    expect(glyphPin(pin({ status: "RESOLVED" }), NOW).size).toBe(24);
  });

  it("pulses under 24 hours old, and never when resolved or still in review", () => {
    expect(pinState(pin({ hoursAgo: 3 }), NOW).pulse).toBe(true);
    expect(pinState(pin({ hoursAgo: 30 }), NOW).pulse).toBe(false);
    expect(pinState(pin({ hoursAgo: 3, status: "RESOLVED" }), NOW).pulse).toBe(false);
    expect(pinState(pin({ hoursAgo: 3, pending: true }), NOW).pulse).toBe(false);
    expect(glyphPin(pin({ hoursAgo: 3 }), NOW).html).toContain("vw-pin-pulse");
  });

  it("draws the viewer's pending report white, with a dashed sky outline", () => {
    const html = glyphPin(pin({ pending: true }), NOW).html;
    expect(html).toContain("2px dashed #0284c7");
    expect(html).not.toContain(`background:${PIN_HEAT.HIGH}`);
  });

  it("marks a pattern with a dashed ring and a repeat badge, but not once resolved", () => {
    expect(glyphPin(pin({ recurring: true }), NOW).html).toContain(
      `2px dashed ${PIN_HEAT.HIGH}`,
    );
    expect(pinState(pin({ recurring: true, status: "RESOLVED" }), NOW).pattern).toBe(false);
  });

  it("treats a date that does not parse as old, never as new", () => {
    const state = pinState(pin({ occurredAt: "nonsense" }), NOW);
    expect(state.pulse).toBe(false);
    expect(state.recent).toBe(false);
  });

  it("gives every distinct look its own cache key", () => {
    const keys = new Set(
      [
        pin(),
        pin({ hoursAgo: 3 }),
        pin({ hoursAgo: 24 * 20 }),
        pin({ pending: true }),
        pin({ status: "RESOLVED" }),
        pin({ recurring: true }),
        pin({ selected: true }),
        pin({ severity: "LOW" }),
        pin({ type: "THEFT" }),
      ].map((p) => glyphPin(p, NOW).key),
    );
    expect(keys.size).toBe(9);
  });
});

describe("the stack", () => {
  it("puts selected and pending on top, severity next, resolved underneath", () => {
    expect(pinZIndex(pin({ selected: true }))).toBeGreaterThan(pinZIndex(pin({ pending: true })));
    expect(pinZIndex(pin({ pending: true }))).toBeGreaterThan(pinZIndex(pin({ severity: "CRITICAL" })));
    expect(pinZIndex(pin({ severity: "CRITICAL" }))).toBeGreaterThan(pinZIndex(pin({ severity: "LOW" })));
    expect(pinZIndex(pin({ status: "RESOLVED" }))).toBeLessThan(pinZIndex(pin({ severity: "LOW" })));
  });

  it("draws events as squares", () => {
    expect(glyphEventPin().html).toContain("border-radius:7px");
  });
});
