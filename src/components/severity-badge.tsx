import type { Severity } from "@/generated/prisma/enums";
import { SEVERITY_META } from "@/lib/constants";

/**
 * Colour-coded severity pill: green (LOW), amber (MEDIUM), red (HIGH),
 * purple (CRITICAL).
 *
 * Colours come from `SEVERITY_META` rather than being written here, because
 * Leaflet needs the same values as hex at runtime and two lists would drift.
 * The dot is filled from the pin hex for exactly that reason — a badge and its
 * pin on the map must be the same colour.
 *
 * Colour is never the only signal: the label is always rendered, so the badge
 * still works in high-contrast mode and for anyone who cannot separate the red
 * from the green.
 */

type SeverityBadgeProps = {
  severity: Severity;
  size?: "sm" | "md";
  /** Hide the text label. Only for dense rows that repeat the level elsewhere. */
  iconOnly?: boolean;
  className?: string;
};

export function SeverityBadge({
  severity,
  size = "md",
  iconOnly = false,
  className = "",
}: SeverityBadgeProps) {
  const meta = SEVERITY_META[severity];

  const sizeClass =
    size === "sm" ? "gap-1.5 px-2 py-0.5 text-xs" : "gap-2 px-2.5 py-1 text-sm";

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ring-1 ring-inset ${meta.badgeClass} ${sizeClass} ${className}`}
      title={meta.description}
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: meta.pin }}
        aria-hidden
      />
      {iconOnly ? (
        <span className="sr-only">{meta.label} severity</span>
      ) : (
        meta.label
      )}
    </span>
  );
}
