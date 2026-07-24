import {
  Bird,
  Car,
  CircleEllipsis,
  DoorOpen,
  Eye,
  Fence,
  Flame,
  Hammer,
  Megaphone,
  PackageOpen,
  PawPrint,
  PhoneOff,
  Pill,
  ShieldAlert,
  TriangleAlert,
  UserSearch,
  Waves,
  type LucideIcon,
} from "lucide-react";
import type { IncidentType } from "@/generated/prisma/enums";
import { INCIDENT_TYPE_META, type IncidentIconName } from "@/lib/constants";

/**
 * Resolves the `icon` name on each `INCIDENT_TYPES` entry to a real component.
 *
 * The names are listed out rather than pulled from lucide's dynamic `icons`
 * map, which would drag the entire icon set into the bundle. `satisfies` keeps
 * this honest: add a type to the schema and TypeScript fails here until it has
 * an icon.
 */
const ICONS = {
  PackageOpen,
  DoorOpen,
  Hammer,
  ShieldAlert,
  Megaphone,
  Eye,
  Fence,
  Car,
  Pill,
  PhoneOff,
  Flame,
  Waves,
  TriangleAlert,
  Bird,
  UserSearch,
  PawPrint,
  CircleEllipsis,
} satisfies Record<IncidentIconName, LucideIcon>;

/**
 * `IncidentTypeMeta.icon` is declared as `string`, so the literal has to be
 * reasserted on the way in. The `satisfies` above is what makes that safe:
 * every name in `INCIDENT_TYPES` has an entry in `ICONS`, or this file does not
 * compile.
 */
export function incidentTypeIcon(type: IncidentType): LucideIcon {
  return ICONS[INCIDENT_TYPE_META[type].icon as IncidentIconName];
}

export function IncidentTypeIcon({
  type,
  className = "size-4",
}: {
  type: IncidentType;
  className?: string;
}) {
  // Indexed rather than called, so the compiler can see this is a lookup into a
  // fixed table and not a component built during render.
  const Icon = ICONS[INCIDENT_TYPE_META[type].icon as IncidentIconName];
  return <Icon className={className} aria-hidden />;
}
