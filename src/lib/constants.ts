import type {
  CoordinatorRequestStatus,
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
  REMOVED: "Erased",
} satisfies Record<IncidentStatus, string>;

/** Statuses a resident is allowed to see on the map and public list. */
export const PUBLIC_INCIDENT_STATUSES = [
  "PUBLISHED",
  "RESOLVED",
] as const satisfies readonly IncidentStatus[];

/**
 * The status an erased report holds. See `src/lib/erasure.ts`.
 *
 * Most reads are narrowed to `PUBLIC_INCIDENT_STATUSES` and exclude it for free.
 * The four that are deliberately wider — the detail page, its metadata, the CSV
 * export and the two moderation lookups — say `status: { not: "REMOVED" }`
 * instead, which is short enough to read in the predicate it sits in. This
 * constant is here so the value has one definition to grep for and one place
 * that explains it, not to be threaded through those five queries.
 */
export const ERASED_INCIDENT_STATUS = "REMOVED" as const satisfies IncidentStatus;

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

/** Badge classes for the admin village list, same palette as severity pills. */
export const VILLAGE_STATUS_BADGES = {
  PENDING: "bg-slate-100 text-slate-700 ring-slate-500/20",
  ACTIVE: "bg-green-50 text-green-700 ring-green-600/20",
  SUSPENDED: "bg-amber-50 text-amber-800 ring-amber-600/20",
  ARCHIVED: "bg-slate-100 text-slate-500 ring-slate-400/20",
} satisfies Record<VillageStatus, string>;

/**
 * The statuses village administration offers as a filter.
 *
 * `ARCHIVED` is deliberately absent, and so is a `PENDING_APPROVAL` value: the
 * schema has exactly one dormant status and `PENDING` is it, already rendering
 * as "Pending approval" above. A second value meaning the same thing would leave
 * two states with nothing to tell them apart and every read filter having to
 * name both. Archived villages are reachable by URL and simply not in the tabs —
 * bringing one back is not a button, it is a decision.
 */
export const VILLAGE_ADMIN_STATUSES = [
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
] as const satisfies readonly VillageStatus[];

/**
 * Characters in a join code.
 *
 * Six, drawn from `JOIN_CODE_ALPHABET` in `src/lib/village.ts` — long enough not
 * to be guessed off a village's name, short enough to read down the phone and to
 * fit on a noticeboard. Here rather than beside the generator because the
 * registration form renders it in a hint and cannot import a module that pulls
 * in `node:crypto`.
 */
export const JOIN_CODE_LENGTH = 6;

/**
 * Why a resident cannot join the village they just picked.
 *
 * The client half of `VILLAGE_JOIN_REFUSALS` in `src/lib/village.ts`, which says
 * the same things to a hand-crafted POST. Two copies because this one has to
 * render in a Client Component and that one has to sit next to the check it
 * describes; they are three short strings and the alternative is a Client
 * Component importing the server-only village module.
 *
 * `ACTIVE` is empty and unreachable — it is here so `satisfies` keeps the record
 * exhaustive when a status is added to the enum.
 */
export const VILLAGE_JOIN_MESSAGES = {
  PENDING: "This village is not yet active. Contact your parish council.",
  SUSPENDED: "Registration is temporarily closed for this village.",
  ARCHIVED: "This village is no longer on VillageWatch.",
  ACTIVE: "",
} satisfies Record<VillageStatus, string>;

/**
 * Villages shown per tab on `/admin/villages`.
 *
 * Small on purpose. The directory tab is 10,670 parishes once England is
 * seeded, so that list is only ever useful once it has been searched — a bigger
 * page would make an unsearched view look like a browsable index rather than
 * the prompt to type something that it is.
 */
export const VILLAGE_ADMIN_PAGE_SIZE = 25;

/**
 * Residents listed on one village's admin page.
 *
 * The appointment picker filters this list in the browser, the same trade
 * `village-picker.tsx` makes and for the same reason: a village is a few hundred
 * people, and a search endpoint for that is a debounce and a loading state
 * bought with nothing. A village that outgrows it says so on the screen.
 */
export const VILLAGE_RESIDENT_PAGE_SIZE = 200;

// ---------------------------------------------------------------------------
// Coordinator access requests
// ---------------------------------------------------------------------------

/**
 * The standings an applicant can claim when asking for coordinator access.
 *
 * These are **descriptions, not permissions**. `CoordinatorRequest.role` is a
 * free-text column and nothing anywhere branches on its value — it is context
 * for the administrator reading the application, in the same way a covering
 * letter is. The list is here rather than as a Prisma enum precisely so that
 * adding "PCSO" one day is a one-line change and not a migration.
 */
export type CoordinatorApplicantRole = {
  value: string;
  label: string;
  description: string;
  /** Show the free-text follow-up when this one is chosen. */
  needsDetail: boolean;
};

/**
 * `needsDetail` is written out on every entry rather than omitted where it is
 * false, for the reason spelled out on `PRICING.featured` below: `as const`
 * narrows each entry to its own literal type, so an absent optional key is
 * absent from that union member and `option.needsDetail` stops type-checking at
 * the call site.
 */
export const COORDINATOR_APPLICANT_ROLES = [
  {
    value: "NW_COORDINATOR",
    label: "Neighbourhood Watch coordinator",
    description: "You already run the watch scheme for this village or a street in it",
    needsDetail: false,
  },
  {
    value: "PARISH_COUNCILLOR",
    label: "Parish councillor",
    description: "You sit on the parish or town council",
    needsDetail: false,
  },
  {
    value: "COMMUNITY_LEADER",
    label: "Community leader",
    description: "You run a group the village recognises — church, school, hall committee",
    needsDetail: false,
  },
  {
    value: "OTHER",
    label: "Something else",
    description: "Tell us how you are involved",
    needsDetail: true,
  },
] as const satisfies readonly CoordinatorApplicantRole[];

export const COORDINATOR_APPLICANT_ROLE_VALUES =
  COORDINATOR_APPLICANT_ROLES.map((r) => r.value) as [string, ...string[]];

/**
 * Value → label, for rendering an application back to the admin reviewing it.
 *
 * Falls back to the stored string in the viewer rather than dropping the row:
 * `role` is a plain text column, so an application filed against an option that
 * has since been renamed must still be readable. Same reasoning as
 * `AUDIT_ACTION_META`.
 */
export const COORDINATOR_APPLICANT_ROLE_LABELS = Object.fromEntries(
  COORDINATOR_APPLICANT_ROLES.map((r) => [r.value, r.label]),
) as Record<string, string | undefined>;

export const COORDINATOR_REQUEST_STATUS_LABELS = {
  PENDING: "Awaiting review",
  APPROVED: "Approved",
  REJECTED: "Declined",
} satisfies Record<CoordinatorRequestStatus, string>;

/**
 * Who may apply.
 *
 * Both resident roles, not `RESIDENT` alone. A `VERIFIED_RESIDENT` is someone a
 * coordinator has already confirmed actually lives in the village, which makes
 * them the *strongest* candidate for the job — locking them out would leave the
 * best applicants with the button hidden and no way to ask. The roles that
 * cannot apply are the ones in `COORDINATOR_ROLES`, because they already have
 * the access this asks for.
 */
export const COORDINATOR_APPLICANT_USER_ROLES = [
  "RESIDENT",
  "VERIFIED_RESIDENT",
] as const satisfies readonly UserRole[];

/** Whether this role is one that can still ask for coordinator access. */
export function canApplyForCoordinator(
  role: UserRole | null | undefined,
): boolean {
  return role !== null && role !== undefined
    ? (COORDINATOR_APPLICANT_USER_ROLES as readonly UserRole[]).includes(role)
    : false;
}

/**
 * Shortest application the form accepts.
 *
 * Long enough that "please" is not an application, short enough that a
 * one-sentence answer from the person who has run the watch scheme for a decade
 * still goes through. The reviewer is reading these, not a classifier.
 */
export const COORDINATOR_REASON_MIN_CHARS = 20;

/** Applications shown per tab in the admin queue. Beyond this, decide some. */
export const COORDINATOR_REQUEST_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// The village directory
// ---------------------------------------------------------------------------

/**
 * Attribution for the seeded village directory.
 *
 * `prisma/seed-villages.ts` builds the directory from the ONS Index of Place
 * Names, which is published under the Open Government Licence v3.0. The licence
 * permits commercial use and sublicensing; the one thing it requires is this
 * acknowledgement, and it requires it *wherever the data is shown* — so it
 * belongs next to any list, search or picker of seeded villages, not only in a
 * credits page nobody opens.
 *
 * Nothing renders it yet, because nothing renders the directory yet — there is
 * no village picker (see "Not built yet" in CLAUDE.md). When one is built, this
 * goes under it. Do not seed a public directory without it.
 */
export const ONS_ATTRIBUTION = [
  "Contains OS data © Crown copyright and database right 2024.",
  "Contains Royal Mail data © Royal Mail copyright and database right 2024.",
  "Source: Office for National Statistics licensed under the Open Government Licence v.3.0.",
].join(" ");

/** Where that licence is set out, for a link next to the acknowledgement. */
export const ONS_LICENCE_URL =
  "https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/";

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
// WhatsApp Channel
// ---------------------------------------------------------------------------

/**
 * Characters in one channel post.
 *
 * WhatsApp itself allows far more, but a post longer than this collapses behind
 * a "read more" on a phone — which is the whole message for an alert somebody
 * is meant to act on. `src/lib/format-alert.ts` trims on a word boundary.
 */
export const WHATSAPP_POST_MAX_CHARS = 900;

/**
 * Characters of the anonymised description carried in a pasted alert.
 *
 * A summary, not the report. The alert ends in a link to the full thing, and
 * anyone entitled to read it can sign in and do so — so the description's job
 * here is to say enough that a reader knows whether to open it, and no more. It
 * is also the field most likely to hold the reporter's own wording (see
 * `formatIncidentAlert`), which is a second reason to keep it short.
 */
export const ALERT_DESCRIPTION_MAX_CHARS = 240;

/**
 * Where a coordinator creates the channel, linked from `/settings` for anyone
 * whose village has not set one up.
 */
export const WHATSAPP_CHANNELS_HELP_URL = "https://www.whatsapp.com/channels";

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
    value: "incident.deleted",
    label: "Deleted by the reporter",
    description:
      "A resident erased their own report — media and tags destroyed, the row kept as REMOVED",
    tone: "negative",
  },
  {
    /**
     * The action `deleteIncidentAction` wrote before erasure replaced the
     * withdrawal (`incident.deleted` above). Kept because the trail is
     * append-only (domain rule 7): rows written by the older build are still in
     * it, and dropping the entry here would render them as a raw string in the
     * viewer and lose them from the filter.
     */
    value: "incident.delete",
    label: "Withdrawn",
    description: "The reporter withdrew their own report (before erasure)",
    tone: "negative",
  },
  {
    value: "account.deleted",
    label: "Account closed",
    description:
      "A resident closed their own account — every report they filed was erased",
    // Sensitive: it is the one action in this list that erases a batch of a
    // village's reports at once, and the only one whose subject is a person
    // rather than a report.
    tone: "sensitive",
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
  {
    value: "incident.report_generated",
    label: "Community safety report generated",
    description:
      "A coordinator produced a written report of a period, for police or the parish council",
    // Sensitive, and it sits next to the CSV export for the same reason: both
    // are a bulk read of the village's reports assembled into a document that
    // leaves the app. The single-incident summary is deliberately not in this
    // list — see `src/lib/community-report.ts` for why that one cannot be
    // audited without breaking the share sheet it exists to open.
    tone: "sensitive",
  },
  {
    value: "coordinator_request.created",
    label: "Coordinator access requested",
    description: "A resident applied to coordinate this village",
    tone: "neutral",
  },
  {
    value: "coordinator_request.approved",
    label: "Coordinator access granted",
    description:
      "An administrator approved an application and promoted the applicant",
    // Sensitive, alongside reading raw text and exporting the CSV: this is the
    // action that hands somebody the ability to do both.
    tone: "sensitive",
  },
  {
    value: "coordinator_request.rejected",
    label: "Coordinator access declined",
    description: "An administrator turned down an application",
    tone: "negative",
  },
  {
    value: "village.channel_update",
    label: "WhatsApp Channel changed",
    description:
      "A coordinator changed where the village's public channel posts go",
    // Sensitive, and one of two configuration changes in this list. Turning
    // the channel on widens the audience for every alert published afterwards
    // from "signed-in residents of this village" to anyone holding the link —
    // the one setting in the app that reaches past the tenant boundary.
    tone: "sensitive",
  },
  {
    value: "village.auto_approve_changed",
    label: "Auto-approve changed",
    description:
      "A coordinator turned publication without review on or off for the village",
    // Sensitive for the mirror-image reason to the channel setting. That one
    // widens who can read a published report; this one removes the human who
    // decides whether it is published at all, so every report filed afterwards
    // reaches the map on the reporter's say-so alone. Who did that, and when,
    // is exactly what the trail is for.
    tone: "sensitive",
  },
  {
    value: "village.activated",
    label: "Village activated",
    description:
      "An administrator put a village into service and minted its join code",
    // Sensitive: it is the moment a directory entry becomes a joinable tenant.
    // Before it, a seeded parish is a name and a map centre; after it, anyone
    // holding the code registers into it as a verified resident.
    tone: "sensitive",
  },
  {
    value: "village.join_code_reset",
    label: "Join code changed",
    description:
      "An administrator replaced the village's join code — the old one stopped working",
    tone: "sensitive",
  },
  {
    value: "village.coordinator_appointed",
    label: "Coordinator appointed",
    description:
      "An administrator made a resident a coordinator directly, without an application",
    // Sensitive for the same reason `coordinator_request.approved` is: it hands
    // somebody the ability to read their neighbours' verbatim reports. This one
    // has no application behind it, so the trail is the only record of it.
    tone: "sensitive",
  },
  {
    value: "retention.sweep",
    label: "Retention sweep",
    description:
      "The scheduled job archived old reports and deleted old media",
    tone: "neutral",
  },
] as const satisfies readonly AuditActionMeta[];

export const AUDIT_ACTION_META = Object.fromEntries(
  AUDIT_ACTIONS.map((a) => [a.value, a]),
) as Record<string, AuditActionMeta | undefined>;

/** Rows per page in the audit viewer. */
export const AUDIT_LOG_PAGE_SIZE = 50;

/** How many locations the dashboard calls out as hotspots. */
export const HOTSPOT_COUNT = 3;

// ---------------------------------------------------------------------------
// Community safety reports
// ---------------------------------------------------------------------------

/**
 * The periods `/reports` offers, plus the custom option.
 *
 * Seven and thirty days, because those are the two meetings a coordinator
 * actually attends: a police liaison call about the week, and a parish council
 * meeting about the month. Anything else is `custom`, which is a pair of date
 * inputs rather than a longer list of presets nobody would read.
 */
export const REPORT_RANGES = [
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "custom", label: "Custom range", days: null },
] as const satisfies readonly {
  value: string;
  label: string;
  days: number | null;
}[];

export type ReportRangePreset = (typeof REPORT_RANGES)[number]["value"];

export const REPORT_RANGE_VALUES = REPORT_RANGES.map((r) => r.value) as [
  ReportRangePreset,
  ...ReportRangePreset[],
];

/** The preset used when nothing valid is in the query string. */
export const DEFAULT_REPORT_RANGE: ReportRangePreset = "7";

/**
 * The widest custom range the picker will accept, in days.
 *
 * A year matches the CSV export's window, and the ceiling is not arbitrary: the
 * incident log below is a table a person reads, and the whole document is
 * assembled in one render and held in one clipboard string. Somebody asking for
 * five years wants the spreadsheet, not this.
 */
export const REPORT_MAX_RANGE_DAYS = 365;

/**
 * How many incidents one report's log will list.
 *
 * The counts, the breakdowns and the hotspots above it are computed over the
 * *whole* range regardless — they are aggregates, and an aggregate that quietly
 * covered a subset would be a wrong number in a document going to the police.
 * Only the log is capped, and the report says on its face how many rows it left
 * out rather than ending early and looking complete.
 */
export const REPORT_MAX_INCIDENTS = 200;

/**
 * Characters of a description that reach the incident log.
 *
 * Longer than the WhatsApp alert's allowance — this is a document somebody sits
 * down with, not a line on a lock screen — and still bounded, because a police
 * report that runs to forty pages does not get read.
 */
export const REPORT_DESCRIPTION_MAX_CHARS = 400;

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
  "/coordinator-apply",
  "/admin",
] as const;

/** The source. Linked from the landing page footer and the README. */
export const GITHUB_URL = "https://github.com/jdell/villagewatch";

/**
 * How many villages are live on this deployment.
 *
 * **Null until somebody can point at the list.** The landing page renders a
 * "trusted by N villages" line only when this is a number, and says something
 * true and unquantified when it is not.
 *
 * That is deliberate and worth keeping. A made-up figure on a public page is a
 * false statement to the exact audience least able to check it — a parish clerk
 * deciding whether to put their residents' incident reports into it. Set this
 * when it is real, and not before.
 */
export const VILLAGES_LIVE: number | null = null;

// ---------------------------------------------------------------------------
// Pricing
// ---------------------------------------------------------------------------

export type PricingTier = {
  name: string;
  /** Rendered as-is. Includes the currency and the period. */
  price: string;
  cadence: string;
  lede: string;
  features: readonly string[];
  cta: { label: string; href: string };
  featured?: boolean;
};

/**
 * The planned pricing, shown on the landing page as a preview.
 *
 * **Nothing charges anything today.** There is no billing integration, no
 * payment provider and no plan enforcement anywhere in the codebase — a Pro
 * village and a free one are the same rows in the same tables. The section that
 * renders this says so on the page, in as many words, because a price list that
 * looks live on a page that cannot take payment is the kind of thing a parish
 * council makes a budget decision against.
 *
 * Before any of this becomes real it needs: a payment provider, a plan column,
 * enforcement at the point each limit bites, and terms that describe what is
 * being sold. None of those exist.
 */
export const PRICING = [
  {
    name: "Village",
    price: "Free",
    cadence: "for one village, always",
    lede: "Everything a parish needs to run a watch scheme. No card, no trial, no resident limit.",
    features: [
      "One village, unlimited residents",
      "AI anonymisation on every report",
      "Live map, incident list and push alerts",
      "Coordinator dashboard and moderation queue",
      "Weekly digest and pattern detection",
      "Full audit trail and CSV export",
    ],
    cta: { label: "Start your village", href: "/register" },
    featured: true,
  },
  {
    name: "Pro",
    price: "£15",
    cadence: "per month, per village",
    lede: "For clusters of parishes and anyone answering to a council. Planned — not yet available.",
    features: [
      "Everything in Village",
      "Multiple villages under one coordinator team",
      "Cross-village pattern detection",
      "Email and SMS alongside push",
      "Longer retention and scheduled exports",
      "Priority support",
    ],
    // Written out rather than omitted: `as const` narrows each entry to its own
    // literal type, so an absent optional key is absent from the union member
    // and `tier.featured` stops type-checking at the call site.
    cta: { label: "Register interest", href: "/register" },
    featured: false,
  },
] as const satisfies readonly PricingTier[];

// ---------------------------------------------------------------------------
// Legal and data protection
// ---------------------------------------------------------------------------

/**
 * Shown on the privacy policy and terms pages. Bump it whenever either
 * document's substance changes — a policy with a stale date is worse than one
 * with no date, because it claims a review that did not happen.
 */
export const LEGAL_LAST_UPDATED = "2026-07-27";

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
 * The privacy policy states these numbers and `GET /api/cron/retention` enforces
 * the first two nightly. Read them from here rather than restating them — a
 * policy and a job that disagree is worse than either alone.
 *
 * The last two are still schedule-only. See the route's own comments for why
 * `auditLogMonths` cannot be enforced from application code at all, and
 * "Not built yet" in CLAUDE.md for `inactiveAccountMonths`.
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

/**
 * Media rows one retention run will clear.
 *
 * Each one is a round trip to Supabase Storage, and the route has 60 seconds.
 * The job runs nightly, so a backlog larger than this drains over a few days
 * instead of timing out halfway through and leaving the deletes half-applied —
 * which, because rows are only dropped after their objects are gone, is a state
 * the next run picks up cleanly.
 */
export const RETENTION_MEDIA_BATCH = 500;

/** Paths per `storage.remove()` call. The API takes an array; this bounds it. */
export const RETENTION_STORAGE_CHUNK = 100;

/**
 * How long a closed rate-limit window is kept before the nightly sweep drops it.
 *
 * Not a privacy figure and deliberately not in `RETENTION` above — nothing in
 * `/privacy` states it, because a `rate_limit` row holds an auth user id, an
 * action name and a count, and says nothing about what was reported. It is here
 * because the table would otherwise grow one row per resident per rule per
 * window forever, and the only job that runs nightly is the retention cron.
 *
 * Longer than the longest window (`RATE_LIMITS.incidentCreate`, a day) so a
 * sweep can never delete a window that is still open and hand somebody a fresh
 * quota mid-day.
 */
export const RATE_LIMIT_RETENTION_DAYS = 7;

/** Minimum age to hold an account. Reports about under-16s are still welcome. */
export const MINIMUM_AGE = 16;
