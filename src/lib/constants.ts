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
  /**
   * Leading glyph for a push notification title. A phone's lock screen has no
   * room for the badge component and strips colour from the text, so this is
   * the only place severity survives the trip — it carries the same green /
   * amber / red / purple reading as `pin`.
   */
  emoji: string;
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
    emoji: "🟢",
    weight: 1,
  },
  {
    value: "MEDIUM",
    label: "Medium",
    description: "Neighbours should keep an eye out",
    pin: "#d97706",
    badgeClass: "bg-amber-50 text-amber-800 ring-amber-600/20",
    emoji: "🟠",
    weight: 2,
  },
  {
    value: "HIGH",
    label: "High",
    description: "Act now — secure property, stay alert",
    pin: "#dc2626",
    badgeClass: "bg-red-50 text-red-700 ring-red-600/20",
    emoji: "🔴",
    weight: 3,
  },
  {
    value: "CRITICAL",
    label: "Critical",
    description: "Danger to life or property, call 999 first",
    pin: "#7c3aed",
    badgeClass: "bg-purple-50 text-purple-700 ring-purple-600/20",
    emoji: "🟣",
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

/**
 * Whether a role may moderate.
 *
 * A function rather than `COORDINATOR_ROLES.includes(role)` at each call site,
 * because the tuple's literal type narrows `includes` to its own three members
 * and rejects a plain `UserRole` — so every caller would otherwise widen it
 * with a cast, and a cast is the wrong shape for a permission check.
 */
export function isCoordinatorRole(role: UserRole | null | undefined): boolean {
  return role !== null && role !== undefined
    ? (COORDINATOR_ROLES as readonly UserRole[]).includes(role)
    : false;
}

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

/**
 * Metres of jitter applied to the home location a resident pins at
 * registration, before it is stored on `User.homeLat`/`homeLng`.
 *
 * Smaller than `LOCATION_FUZZ_METERS` because this point is never rendered —
 * its only job is to decide whether an incident is inside the resident's
 * notification radius, and every radius on offer starts at 100m. Jittering it
 * as hard as an incident pin would start dropping alerts about the street the
 * resident actually lives on.
 *
 * It is jittered at all because a home location is the most re-identifying
 * coordinate in the system: an exact one is an address. The screen asks for an
 * approximate area for the same reason.
 */
export const HOME_LOCATION_FUZZ_METERS = 75;

/** Incident types never shown on the public map, however they are reported. */
export const MAP_HIDDEN_TYPES = [] as const satisfies readonly IncidentType[];

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export type NotificationRadiusOption = {
  /** Metres, or null for "anywhere in the village". */
  value: number | null;
  label: string;
  description: string;
};

/**
 * How close an incident has to be before a resident hears about it.
 *
 * `null` is first and is the default: a village is a few hundred metres across,
 * so a resident who has not thought about this wants all of it. The narrower
 * options exist for people on a busy road who would otherwise mute the app
 * entirely — a smaller radius is better than no alerts at all.
 */
export const NOTIFICATION_RADII = [
  {
    value: null,
    label: "The whole village",
    description: "Everything reported anywhere in your village",
  },
  {
    value: 100,
    label: "Within 100m",
    description: "Your street and the ones either side",
  },
  {
    value: 200,
    label: "Within 200m",
    description: "Your immediate neighbourhood",
  },
  {
    value: 500,
    label: "Within 500m",
    description: "A few minutes' walk in any direction",
  },
  {
    value: 1000,
    label: "Within 1km",
    description: "Most of a small village",
  },
] as const satisfies readonly NotificationRadiusOption[];

/**
 * The finite radii a client may send, for validating a settings form. Typed as
 * a non-empty tuple so Zod can build a literal union out of it.
 */
export const NOTIFICATION_RADIUS_VALUES = NOTIFICATION_RADII.flatMap(
  (option) => option.value ?? [],
) as [number, ...number[]];

/**
 * Ceiling on how many residents one incident notifies.
 *
 * OneSignal takes a few thousand aliases per request and a village should never
 * come close. If one somehow does, sending to a truncated audience beats a
 * rejected request that reaches nobody — the shortfall is logged.
 */
export const MAX_PUSH_RECIPIENTS = 2_000;

// ---------------------------------------------------------------------------
// Dashboard and digest
// ---------------------------------------------------------------------------

/** Reports waiting on a coordinator, newest first. Beyond this, filter. */
export const MODERATION_QUEUE_SIZE = 25;

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export type AuditActionMeta = {
  /** The literal written to `AuditLog.action`. */
  value: string;
  label: string;
  description: string;
  /**
   * Draws the eye down the column. `sensitive` is reserved for the two actions
   * that move personal data — reading a report's original wording, and taking
   * a village's reports out of the app as a spreadsheet.
   */
  tone: "neutral" | "positive" | "negative" | "sensitive";
};

/**
 * Every action the application writes to `AuditLog`, in the order a
 * coordinator scanning the filter would look for them.
 *
 * This is the display list, not the source of truth — `action` is a plain
 * string column and the trail is append-only, so a row written by an older
 * build with an action that has since been renamed must still render. The
 * viewer falls back to the raw string rather than dropping the row.
 */
export const AUDIT_ACTIONS = [
  {
    value: "incident.create",
    label: "Report filed",
    description: "A resident submitted a report",
    tone: "neutral",
  },
  {
    value: "incident.publish",
    label: "Published",
    description: "Approved and put on the village map",
    tone: "positive",
  },
  {
    value: "incident.reject",
    label: "Rejected",
    description: "Turned down at review",
    tone: "negative",
  },
  {
    value: "incident.resolve",
    label: "Resolved",
    description: "Marked as dealt with",
    tone: "positive",
  },
  {
    value: "incident.archive",
    label: "Archived",
    description: "Taken off the map",
    tone: "neutral",
  },
  {
    value: "incident.edit",
    label: "Edited",
    description: "The reporter changed their own report",
    tone: "neutral",
  },
  {
    value: "incident.delete",
    label: "Withdrawn",
    description: "The reporter deleted their own report",
    tone: "negative",
  },
  {
    value: "incident.raw_viewed",
    label: "Original wording read",
    description: "A coordinator opened the reporter's verbatim text",
    tone: "sensitive",
  },
  {
    value: "incident.notify",
    label: "Alert re-sent",
    description: "A village-wide push was sent again",
    tone: "neutral",
  },
  {
    value: "incident.export",
    label: "CSV exported",
    description: "The village's reports were downloaded",
    tone: "sensitive",
  },
] as const satisfies readonly AuditActionMeta[];

export const AUDIT_ACTION_META = Object.fromEntries(
  AUDIT_ACTIONS.map((a) => [a.value, a]),
) as Record<string, AuditActionMeta | undefined>;

/** Rows per page in the audit viewer. */
export const AUDIT_LOG_PAGE_SIZE = 50;

/** How many locations the dashboard calls out as hotspots. */
export const HOTSPOT_COUNT = 3;

/** The window the weekly digest covers, and the comparison window before it. */
export const DIGEST_WINDOW_DAYS = 7;

/**
 * Enough incidents for the digest to describe a week without blowing out the
 * prompt. A village producing more than this in a week has a bigger problem
 * than a truncated summary.
 */
export const DIGEST_MAX_INCIDENTS = 60;

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

// ---------------------------------------------------------------------------
// Legal and data protection
// ---------------------------------------------------------------------------

/**
 * Shown on the privacy policy and terms pages. Bump it whenever either
 * document's substance changes — a policy with a stale date is worse than one
 * with no date, because it claims a review that did not happen.
 */
export const LEGAL_LAST_UPDATED = "2026-07-25";

/**
 * The data controller under UK GDPR.
 *
 * **Placeholders.** Each deployment serves one parish, and the council running
 * it is the controller — VillageWatch processes on their behalf. Fill these in
 * before a single real resident registers: a privacy notice that does not name
 * a controller or give a working contact address does not satisfy Article 13.
 */
export const DATA_CONTROLLER = {
  name: "[Parish Council name]",
  addressLines: [
    "[Parish Council address line 1]",
    "[Town]",
    "[Postcode]",
  ],
  email: "[clerk@parish-council.example.uk]",
  phone: "[01234 567890]",
  /** Registration number from the ICO's public register. */
  icoRegistration: "[ICO registration number]",
} as const;

/**
 * How long things are kept.
 *
 * These are the schedule the privacy policy states, not a job that runs — there
 * is no retention worker yet (see "Not built yet" in CLAUDE.md). Wire one up
 * before launch, and read the numbers from here rather than restating them.
 */
export const RETENTION = {
  /** Published incidents move to ARCHIVED and drop off the map at this age. */
  incidentArchiveMonths: 12,
  /** Photos and video are deleted from storage at this age, blurred or not. */
  mediaDeleteMonths: 6,
  /** `AuditLog` rows, kept longer because they are the accountability record. */
  auditLogMonths: 24,
  /** An account with no sign-in for this long is closed and anonymised. */
  inactiveAccountMonths: 24,
} as const;

/** Minimum age to hold an account. Reports about under-16s are still welcome. */
export const MINIMUM_AGE = 16;
