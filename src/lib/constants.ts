import type {
  IncidentStatus,
  IncidentType,
  Severity,
  UserRole,
  VillageStatus,
} from "@/generated/prisma/enums";

/**
 * Display metadata for the Prisma enums, plus the map palette.
 *
 * Types come from the generated Prisma enums via `import type`, so this module
 * stays free of runtime Prisma code and is safe to import from Client
 * Components. `satisfies` keeps every list exhaustive — add a value to
 * `schema.prisma` and TypeScript will fail here until it is described.
 */

export type IncidentTypeMeta = {
  value: IncidentType;
  label: string;
  /** lucide-react icon name, resolved by the reporting wizard. */
  icon: string;
  description: string;
  /** Crime-ish types default to a higher severity in the report wizard. */
  defaultSeverity: Severity;
};

export const INCIDENT_TYPES = [
  {
    value: "THEFT",
    label: "Theft",
    icon: "PackageOpen",
    description: "Something taken from a garden, doorstep or outbuilding",
    defaultSeverity: "MEDIUM",
  },
  {
    value: "BURGLARY",
    label: "Burglary",
    icon: "DoorOpen",
    description: "Break-in to a home or business",
    defaultSeverity: "HIGH",
  },
  {
    value: "VANDALISM",
    label: "Vandalism",
    icon: "Hammer",
    description: "Damage to property, graffiti, broken fixtures",
    defaultSeverity: "MEDIUM",
  },
  {
    value: "ASSAULT",
    label: "Assault",
    icon: "ShieldAlert",
    description: "Violence or threats towards a person",
    defaultSeverity: "CRITICAL",
  },
  {
    value: "ANTISOCIAL_BEHAVIOUR",
    label: "Antisocial behaviour",
    icon: "Megaphone",
    description: "Noise, intimidation, groups causing a nuisance",
    defaultSeverity: "LOW",
  },
  {
    value: "SUSPICIOUS_ACTIVITY",
    label: "Suspicious activity",
    icon: "Eye",
    description: "Someone or something that felt out of place",
    defaultSeverity: "LOW",
  },
  {
    value: "TRESPASSING",
    label: "Trespassing",
    icon: "Fence",
    description: "Someone on private land without permission",
    defaultSeverity: "MEDIUM",
  },
  {
    value: "VEHICLE_CRIME",
    label: "Vehicle crime",
    icon: "Car",
    description: "Break-in, theft of parts, or damage to a vehicle",
    defaultSeverity: "MEDIUM",
  },
  {
    value: "DRUG_ACTIVITY",
    label: "Drug activity",
    icon: "Pill",
    description: "Suspected dealing or use in a public place",
    defaultSeverity: "HIGH",
  },
  {
    value: "FRAUD_SCAM",
    label: "Fraud or scam",
    icon: "PhoneOff",
    description: "Doorstep callers, cold calls, online scams",
    defaultSeverity: "MEDIUM",
  },
  {
    value: "FIRE",
    label: "Fire",
    icon: "Flame",
    description: "Fire or a serious fire risk",
    defaultSeverity: "CRITICAL",
  },
  {
    value: "FLOOD",
    label: "Flooding",
    icon: "Waves",
    description: "Standing water, blocked drains, river levels",
    defaultSeverity: "HIGH",
  },
  {
    value: "ROAD_HAZARD",
    label: "Road hazard",
    icon: "TriangleAlert",
    description: "Potholes, fallen trees, ice, obstructions",
    defaultSeverity: "MEDIUM",
  },
  {
    value: "WILDLIFE",
    label: "Wildlife",
    icon: "Bird",
    description: "Injured, dangerous or out-of-place animals",
    defaultSeverity: "LOW",
  },
  {
    value: "MISSING_PERSON",
    label: "Missing person",
    icon: "UserSearch",
    description: "Someone unaccounted for",
    defaultSeverity: "CRITICAL",
  },
  {
    value: "MISSING_PET",
    label: "Missing pet",
    icon: "PawPrint",
    description: "A lost or found animal",
    defaultSeverity: "LOW",
  },
  {
    value: "OTHER",
    label: "Something else",
    icon: "CircleEllipsis",
    description: "Anything that does not fit the categories above",
    defaultSeverity: "LOW",
  },
] as const satisfies readonly IncidentTypeMeta[];

export const INCIDENT_TYPE_VALUES = INCIDENT_TYPES.map((t) => t.value) as [
  IncidentType,
  ...IncidentType[],
];

export const INCIDENT_TYPE_LABELS = Object.fromEntries(
  INCIDENT_TYPES.map((t) => [t.value, t.label]),
) as Record<IncidentType, string>;

/** Whole metadata row by enum value, for components rendering one incident. */
export const INCIDENT_TYPE_META = Object.fromEntries(
  INCIDENT_TYPES.map((t) => [t.value, t]),
) as Record<IncidentType, IncidentTypeMeta>;

/**
 * Union of every lucide icon name used above. `IncidentTypeMeta.icon` is a
 * plain `string`, so this is what lets `incident-type-icon.tsx` prove its
 * lookup table covers every type.
 */
export type IncidentIconName = (typeof INCIDENT_TYPES)[number]["icon"];

// ---------------------------------------------------------------------------
// Severity
// ---------------------------------------------------------------------------

export type SeverityMeta = {
  value: Severity;
  label: string;
  description: string;
  /** Hex, used for Leaflet pins and canvas heatmaps — not a Tailwind class. */
  pin: string;
  /** Tailwind classes for badges in the incident list and detail views. */
  badgeClass: string;
  /** Sort weight: higher wins when ranking a cluster of incidents. */
  weight: number;
};

/**
 * Green → amber → red → purple, as specified in the Phase 2 architecture. The
 * jump to purple at CRITICAL is deliberate: escalating red to a darker red
 * reads as "more of the same" at a glance on a map, whereas a hue change reads
 * as a different kind of thing entirely.
 *
 * The schema calls the second level MEDIUM (the architecture doc says
 * MODERATE); MEDIUM is what `Severity` in `schema.prisma` actually is.
 */
export const SEVERITIES = [
  {
    value: "LOW",
    label: "Low",
    description: "Worth logging, no immediate risk",
    pin: "#16a34a",
    badgeClass: "bg-green-50 text-green-700 ring-green-600/20",
    weight: 1,
  },
  {
    value: "MEDIUM",
    label: "Medium",
    description: "Neighbours should keep an eye out",
    pin: "#d97706",
    badgeClass: "bg-amber-50 text-amber-800 ring-amber-600/20",
    weight: 2,
  },
  {
    value: "HIGH",
    label: "High",
    description: "Act now — secure property, stay alert",
    pin: "#dc2626",
    badgeClass: "bg-red-50 text-red-700 ring-red-600/20",
    weight: 3,
  },
  {
    value: "CRITICAL",
    label: "Critical",
    description: "Danger to life or property, call 999 first",
    pin: "#7c3aed",
    badgeClass: "bg-purple-50 text-purple-700 ring-purple-600/20",
    weight: 4,
  },
] as const satisfies readonly SeverityMeta[];

export const SEVERITY_VALUES = SEVERITIES.map((s) => s.value) as [
  Severity,
  ...Severity[],
];

/** Severity → hex, for Leaflet marker icons and cluster colouring. */
export const SEVERITY_PIN_COLORS = Object.fromEntries(
  SEVERITIES.map((s) => [s.value, s.pin]),
) as Record<Severity, string>;

export const SEVERITY_LABELS = Object.fromEntries(
  SEVERITIES.map((s) => [s.value, s.label]),
) as Record<Severity, string>;

/** Whole metadata row by enum value, for badges and pin rendering. */
export const SEVERITY_META = Object.fromEntries(
  SEVERITIES.map((s) => [s.value, s]),
) as Record<Severity, SeverityMeta>;

// ---------------------------------------------------------------------------
// Status and roles
// ---------------------------------------------------------------------------

export const INCIDENT_STATUS_LABELS = {
  DRAFT: "Draft",
  PENDING_REVIEW: "Awaiting review",
  PUBLISHED: "Published",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
} satisfies Record<IncidentStatus, string>;

/** Statuses a resident is allowed to see on the map and public list. */
export const PUBLIC_INCIDENT_STATUSES = [
  "PUBLISHED",
  "RESOLVED",
] as const satisfies readonly IncidentStatus[];

export const USER_ROLE_LABELS = {
  RESIDENT: "Resident",
  VERIFIED_RESIDENT: "Verified resident",
  COORDINATOR: "Village coordinator",
  MODERATOR: "Moderator",
  ADMIN: "Administrator",
} satisfies Record<UserRole, string>;

/** Roles allowed into the coordinator dashboard and moderation queue. */
export const COORDINATOR_ROLES = [
  "COORDINATOR",
  "MODERATOR",
  "ADMIN",
] as const satisfies readonly UserRole[];

export const VILLAGE_STATUS_LABELS = {
  PENDING: "Pending approval",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  ARCHIVED: "Archived",
} satisfies Record<VillageStatus, string>;

// ---------------------------------------------------------------------------
// Map
// ---------------------------------------------------------------------------

export const MAP_DEFAULTS = {
  zoom: 14,
  minZoom: 10,
  maxZoom: 18,
  tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  tileAttribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
} as const;

/**
 * Metres of random jitter applied to a reported location before it is stored.
 * Protects the reporter's exact position; the pin still lands on the right
 * street. Keep in sync with `Incident.locationFuzzMeters`.
 */
export const LOCATION_FUZZ_METERS = 100;

/** Incident types never shown on the public map, however they are reported. */
export const MAP_HIDDEN_TYPES = [] as const satisfies readonly IncidentType[];

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export const APP_NAME = "VillageWatch";
export const APP_TAGLINE = "Keep your village safe";
export const APP_DESCRIPTION =
  "Report what you see in seconds. AI strips out personal details, plots it on a live map, and alerts your neighbours when a pattern emerges.";

/** Routes that require a signed-in user. Mirrored by `src/proxy.ts`. */
export const PROTECTED_ROUTES = [
  "/map",
  "/incidents",
  "/dashboard",
  "/settings",
] as const;
