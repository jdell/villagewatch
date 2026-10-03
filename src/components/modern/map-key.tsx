import { PinPreview } from "@/components/modern/pin-preview";
import { SEVERITIES } from "@/lib/constants";
import { HEATMAP_LEGEND_CSS } from "@/lib/heatmap";
import { PIN_HEAT, type GlyphPinInput } from "@/lib/map/glyph-pin";
import type { Severity } from "@/generated/prisma/enums";

/**
 * "How to read the map" — the key the design moves off the map and into the
 * filter sheet. A grid of four columns on `#f8fafc`, each a 46px swatch over an
 * 11px label, the handoff's `keyItems` layout, with the four heat colours in a
 * row beneath it as the desktop key has them.
 *
 * Every swatch is a real pin from `glyphPin`, drawn at a fixed point in time so
 * the key does not change between renders.
 */

/** Any fixed instant: the key's pins are described relative to it. */
const KEY_NOW = Date.UTC(2026, 0, 15, 12);
const ago = (hours: number) => new Date(KEY_NOW - hours * 3600_000).toISOString();

const ITEMS: { label: string; pin: GlyphPinInput | "event" }[] = [
  { label: "This week", pin: { type: "BURGLARY", severity: "HIGH", occurredAt: ago(48), recurring: false } },
  { label: "Older than 7 days", pin: { type: "THEFT", severity: "MEDIUM", occurredAt: ago(24 * 20), recurring: false } },
  { label: "Last 24 hours", pin: { type: "SUSPICIOUS_ACTIVITY", severity: "MEDIUM", occurredAt: ago(2), recurring: false } },
  { label: "Part of a pattern", pin: { type: "VEHICLE_CRIME", severity: "HIGH", occurredAt: ago(48), recurring: true } },
  { label: "Resolved", pin: { type: "VANDALISM", severity: "LOW", occurredAt: ago(24 * 12), recurring: false, status: "RESOLVED" } },
  { label: "Yours, in review", pin: { type: "THEFT", severity: "MEDIUM", occurredAt: ago(1), recurring: false, pending: true } },
  { label: "Event", pin: "event" },
];

export function MapKey() {
  return (
    <div className="flex flex-col gap-3 rounded-[14px] bg-[#f8fafc] px-2 py-3.5">
      <div className="grid grid-cols-4 gap-x-1.5 gap-y-3">
        {ITEMS.map((item) => (
          <KeyItem key={item.label} label={item.label}>
            <PinPreview pin={item.pin} now={KEY_NOW} />
          </KeyItem>
        ))}
        <KeyItem label="Busier on the heatmap">
          <span
            className="h-2.5 w-12 rounded-full"
            style={{ background: HEATMAP_LEGEND_CSS }}
          />
        </KeyItem>
      </div>
      <ul className="flex flex-wrap justify-center gap-x-3 gap-y-1 border-t border-[#e2e8f0] px-1 pt-3 text-xs text-[#475569]">
        {SEVERITIES.map((severity) => (
          <li key={severity.value} className="inline-flex items-center gap-[5px]">
            <span
              className="size-[9px] rounded-full"
              style={{ backgroundColor: PIN_HEAT[severity.value as Severity] }}
              aria-hidden
            />
            {severity.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function KeyItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="flex h-[46px] items-center justify-center">{children}</span>
      <span className="text-center text-[11px] leading-tight text-[#475569]">
        {label}
      </span>
    </div>
  );
}
