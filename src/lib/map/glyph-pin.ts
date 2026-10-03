import type {
  IncidentStatus,
  IncidentType,
  Severity,
} from "@/generated/prisma/enums";
import { INCIDENT_TYPE_META, type IncidentIconName } from "@/lib/constants";
import { GLYPH_NODES, STATE_GLYPHS, iconSvg } from "@/lib/map/glyphs";

/**
 * The map's pin — design option 1a, the glyph disc.
 *
 * A round disc with the category's icon inside: the fill says how serious, the
 * glyph says what kind. Round with no tail, so the centre *is* the location and
 * pins can sit closer together without covering the street names under them.
 * Pure and client-safe; it returns HTML because a Leaflet `divIcon` takes HTML.
 *
 * ## The fill is a heat ramp, and that is the brief rather than the prototype
 *
 * The handoff's prototype filled discs with the app's severity palette — green,
 * amber, red, purple. The redesign brief asked for a heat ramp instead, and the
 * brief is what was built: yellow `#eab308` → orange `#f97316` → red `#ef4444`
 * → dark red `#991b1b`, LOW to CRITICAL. One colour that gets hotter reads as
 * "more serious" without a key; four unrelated hues needed one.
 *
 * **The glyph is dark on the two light fills.** White on `#eab308` is under
 * 2:1, and on `#f97316` under 3:1 — below what WCAG 1.4.11 asks of a graphical
 * object, on the one thing inside the pin that says what happened. So LOW and
 * MEDIUM carry a near-black glyph and HIGH and CRITICAL a white one. The
 * handoff drew white throughout; legibility won.
 *
 * ## States, from the handoff's "Pin system" board
 *
 * - **Recent** (this week) is 32px and **older** 26px — today's map's rule.
 * - **Under 24 hours old pulses**: a ring in the pin's colour that grows and
 *   fades, so what is new is findable at a glance. Off under
 *   `prefers-reduced-motion` (see `.vw-pin-pulse` in globals.css).
 * - **Pending** — the viewer's own report, still with the coordinator — is a
 *   white disc with a dashed `#0284c7` outline and the glyph in `#0284c7`. Only
 *   ever the viewer's own: the page adds nobody else's queue to the map
 *   (domain rule 6).
 * - **Resolved** is small (24px), white with a grey edge and a grey glyph, and
 *   carries a dark tick badge.
 * - **Part of a pattern** gets a dashed ring in the pin's colour and a dark
 *   badge with a repeat glyph. The prototype's badge was a count; the map does
 *   not know how many reports a pattern holds, only that this one is part of
 *   one, so it says "repeat" rather than inventing a number.
 * - **Selected** gets a `#0284c7` halo.
 */

export const PIN_HEAT = {
  LOW: "#eab308",
  MEDIUM: "#f97316",
  HIGH: "#ef4444",
  CRITICAL: "#991b1b",
} as const satisfies Record<Severity, string>;

/**
 * The badge behind a severity label in the sheets — a pale wash of the
 * pin's own hue with a dark text of it, as the handoff's `SEV.bg` / `SEV.tx`
 * pairs are for its palette. Every text colour clears 4.5:1 on its wash.
 */
export const PIN_SOFT = {
  LOW: { bg: "#fefce8", text: "#854d0e" },
  MEDIUM: { bg: "#fff7ed", text: "#9a3412" },
  HIGH: { bg: "#fef2f2", text: "#991b1b" },
  CRITICAL: { bg: "#fef2f2", text: "#7f1d1d" },
} as const satisfies Record<Severity, { bg: string; text: string }>;

/** The glyph on each fill — dark where white would be illegible. */
export const PIN_GLYPH_COLOR = {
  LOW: "#422006",
  MEDIUM: "#431407",
  HIGH: "#ffffff",
  CRITICAL: "#ffffff",
} as const satisfies Record<Severity, string>;

const SKY = "#0284c7";
const SKY_DARK = "#0369a1";
const RECENT_MS = 7 * 24 * 60 * 60 * 1000;
const PULSE_MS = 24 * 60 * 60 * 1000;

export type GlyphPinInput = {
  type: IncidentType;
  severity: Severity;
  occurredAt: string;
  recurring: boolean;
  status?: IncidentStatus;
  /** The viewer's own report, still awaiting review. */
  pending?: boolean;
  selected?: boolean;
};

export type GlyphPin = {
  html: string;
  /** Square — the disc's box, decorations inside it. */
  size: number;
  /** A stable key for an icon cache: two pins with the same key look the same. */
  key: string;
};

/** Size and state, decided once so `glyphPin` and the cache key agree. */
export function pinState(input: GlyphPinInput, now: number) {
  const at = new Date(input.occurredAt).getTime();
  const age = Number.isNaN(at) ? Infinity : now - at;
  const resolved = input.status === "RESOLVED";
  const pending = Boolean(input.pending);

  return {
    resolved,
    pending,
    recent: age <= RECENT_MS,
    pulse: !resolved && !pending && age <= PULSE_MS && age >= -PULSE_MS,
    pattern: input.recurring && !resolved,
    size: resolved ? 24 : age <= RECENT_MS ? 32 : 26,
  };
}

export function glyphPin(input: GlyphPinInput, now: number): GlyphPin {
  const state = pinState(input, now);
  const S = state.size;
  const heat = PIN_HEAT[input.severity];

  const fill = state.pending || state.resolved ? "#ffffff" : heat;
  const glyphColor = state.pending
    ? SKY
    : state.resolved
      ? "#64748b"
      : PIN_GLYPH_COLOR[input.severity];
  const border = state.pending
    ? `2px dashed ${SKY}`
    : state.resolved
      ? "1.5px solid #94a3b8"
      : "2px solid #ffffff";
  const shadow =
    "0 1px 3px rgba(15,23,42,.38),0 0 0 1px rgba(15,23,42,.06)";

  const icon = INCIDENT_TYPE_META[input.type].icon as IncidentIconName;
  const glyph = iconSvg(GLYPH_NODES[icon], Math.round(S * 0.5), glyphColor, 2.25);

  const ring = (inset: number) =>
    `position:absolute;left:${-inset}px;top:${-inset}px;width:${S + 2 * inset}px;height:${S + 2 * inset}px;border-radius:50%;box-sizing:border-box;`;

  let under = "";
  let over = "";

  if (input.selected) {
    under += `<div style="${ring(5)}background:rgba(2,132,199,.22);border:2px solid ${SKY}"></div>`;
  }
  if (state.pulse) {
    under += `<div class="vw-pin-pulse" style="${ring(0)}background:${heat}"></div>`;
  }
  if (state.pattern) {
    over += `<div style="${ring(5)}border:2px dashed ${heat}"></div>`;
    over += `<div style="position:absolute;left:${Math.round(S / 2 + (S / 2) * 0.55)}px;top:${Math.round(-7)}px;width:17px;height:17px;border-radius:9px;background:#0f172a;box-shadow:0 0 0 1.5px #fff;display:flex;align-items:center;justify-content:center">${iconSvg(STATE_GLYPHS.repeat, 10, "#ffffff", 2.75)}</div>`;
  }
  if (state.resolved) {
    over += `<div style="position:absolute;left:${Math.round(S / 2 + (S / 2) * 0.5)}px;top:${Math.round(S / 2 + (S / 2) * 0.3)}px;width:14px;height:14px;border-radius:7px;background:#475569;box-shadow:0 0 0 1.5px #fff;display:flex;align-items:center;justify-content:center">${iconSvg(STATE_GLYPHS.check, 9, "#ffffff", 3.5)}</div>`;
  }

  const disc = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;box-sizing:border-box;background:${fill};border:${border};border-radius:50%;box-shadow:${shadow}">${glyph}</div>`;

  return {
    html: `<div style="position:relative;width:${S}px;height:${S}px">${under}${disc}${over}</div>`,
    size: S,
    key: [
      input.type,
      input.severity,
      S,
      state.pending ? "p" : "",
      state.resolved ? "r" : "",
      state.pulse ? "n" : "",
      state.pattern ? "t" : "",
      input.selected ? "s" : "",
    ].join("|"),
  };
}

/**
 * Stacking order on the map: the viewer's own pending report and anything
 * selected on top, then by severity, resolved reports at the bottom — the
 * design's "severity sorts the stack".
 */
export function pinZIndex(input: GlyphPinInput): number {
  if (input.selected) return 2000;
  if (input.pending) return 1500;
  if (input.status === "RESOLVED") return -200;
  return { LOW: 0, MEDIUM: 100, HIGH: 200, CRITICAL: 300 }[input.severity];
}

/**
 * The event pin in the glyph style: a 26px white rounded square with a
 * `#0369a1` edge and a calendar — squares never read as incidents.
 */
export function glyphEventPin(): { html: string; size: number } {
  return {
    size: 26,
    html: `<div style="width:26px;height:26px;border-radius:7px;background:#fff;border:2px solid ${SKY_DARK};box-sizing:border-box;box-shadow:0 1px 3px rgba(15,23,42,.35);display:flex;align-items:center;justify-content:center">${iconSvg(STATE_GLYPHS.calendarDays, 14, SKY_DARK, 2.25)}</div>`,
  };
}
