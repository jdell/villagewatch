import { __iconNode as bird } from "lucide-react/dist/esm/icons/bird.mjs";
import { __iconNode as calendarDays } from "lucide-react/dist/esm/icons/calendar-days.mjs";
import { __iconNode as car } from "lucide-react/dist/esm/icons/car.mjs";
import { __iconNode as check } from "lucide-react/dist/esm/icons/check.mjs";
import { __iconNode as circleEllipsis } from "lucide-react/dist/esm/icons/circle-ellipsis.mjs";
import { __iconNode as doorOpen } from "lucide-react/dist/esm/icons/door-open.mjs";
import { __iconNode as eye } from "lucide-react/dist/esm/icons/eye.mjs";
import { __iconNode as fence } from "lucide-react/dist/esm/icons/fence.mjs";
import { __iconNode as flame } from "lucide-react/dist/esm/icons/flame.mjs";
import { __iconNode as hammer } from "lucide-react/dist/esm/icons/hammer.mjs";
import { __iconNode as megaphone } from "lucide-react/dist/esm/icons/megaphone.mjs";
import { __iconNode as packageOpen } from "lucide-react/dist/esm/icons/package-open.mjs";
import { __iconNode as pawPrint } from "lucide-react/dist/esm/icons/paw-print.mjs";
import { __iconNode as phoneOff } from "lucide-react/dist/esm/icons/phone-off.mjs";
import { __iconNode as pill } from "lucide-react/dist/esm/icons/pill.mjs";
import { __iconNode as repeat } from "lucide-react/dist/esm/icons/repeat.mjs";
import { __iconNode as shieldAlert } from "lucide-react/dist/esm/icons/shield-alert.mjs";
import { __iconNode as triangleAlert } from "lucide-react/dist/esm/icons/triangle-alert.mjs";
import { __iconNode as userSearch } from "lucide-react/dist/esm/icons/user-search.mjs";
// `waves.mjs` is an alias that re-exports `waves-horizontal` and carries no
// node of its own — the `Waves` component is this drawing.
import { __iconNode as waves } from "lucide-react/dist/esm/icons/waves-horizontal.mjs";
import type { IncidentIconName } from "@/lib/constants";

/**
 * Lucide icons as SVG *strings*, for the map's pins.
 *
 * A Leaflet `divIcon` takes HTML, not a React element, so the glyph inside a
 * pin cannot be `<IncidentTypeIcon>`. These are the same icons — the shapes
 * lucide-react builds its components from, read from the module each component
 * lives in — so a pin's glyph and the icon on every card and chip in the app
 * are one drawing, not two that drift.
 *
 * That is a deep import into lucide-react's `dist/esm/icons/*.mjs`, which is
 * not its public API. It is allowed (the package has no `exports` map) and
 * pinned by the lockfile, and `tests/glyph-pins.test.ts` loads every icon here,
 * so an upgrade that moves the files fails the suite rather than drawing empty
 * pins. Client-safe and pure.
 */

type IconNode = ReadonlyArray<
  readonly [string, Readonly<Record<string, string | number>>]
>;

export const GLYPH_NODES = {
  PackageOpen: packageOpen,
  DoorOpen: doorOpen,
  Hammer: hammer,
  ShieldAlert: shieldAlert,
  Megaphone: megaphone,
  Eye: eye,
  Fence: fence,
  Car: car,
  Pill: pill,
  PhoneOff: phoneOff,
  Flame: flame,
  Waves: waves,
  TriangleAlert: triangleAlert,
  Bird: bird,
  UserSearch: userSearch,
  PawPrint: pawPrint,
  CircleEllipsis: circleEllipsis,
} satisfies Record<IncidentIconName, IconNode>;

/** The three non-category glyphs a pin carries. */
export const STATE_GLYPHS = { check, repeat, calendarDays } as const;

/** Attribute values are lucide's own path data and numbers — escaped anyway. */
function attr(value: string | number): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/**
 * `<svg …>…</svg>` for an icon node, at a size, in a colour, at a stroke width
 * — lucide's own defaults otherwise (24-unit viewbox, round caps and joins).
 * `aria-hidden`: a pin's name is on the marker, not on its drawing.
 */
export function iconSvg(
  node: IconNode,
  size: number,
  color: string,
  strokeWidth = 2,
): string {
  const children = node
    .map(([tag, attrs]) => {
      const rendered = Object.entries(attrs)
        .filter(([name]) => name !== "key")
        .map(([name, value]) => `${name}="${attr(value)}"`)
        .join(" ");
      return `<${tag} ${rendered}/>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${attr(color)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display:block;flex:none">${children}</svg>`;
}
