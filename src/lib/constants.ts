import type {
  CoordinatorRequestStatus,
  IncidentStatus,
  IncidentType,
  Severity,
  UserRole,
  VillageStatus,
} from "@/generated/prisma/enums";
// `import type` only. `face-blur.ts` is browser-only — it assumes `document`
// and `canvas` — so a value import here would drag it into every server module
// that reads a label. The type is erased, and keeping the union defined once is
// what stops `PRIVACY_LEVELS` naming a mode the blur code does not implement.
import type { FaceRedactionMode } from "@/lib/media/face-blur";

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
 * Eight, drawn from `JOIN_CODE_ALPHABET` in `src/lib/villages.ts` — long enough
 * not to be guessed off a village's name, short enough to read down the phone
 * and to fit on a noticeboard. Here rather than beside the generator because a
 * Client Component cannot import a module that pulls in `node:crypto`.
 *
 * **It was 6 and nothing minted a 6-character code.** The constant was read only
 * by the generator in the dead singular village module; the live one had its own
 * `const JOIN_CODE_LENGTH = 8` and every code ever issued — including the seed's
 * `VILLAGE1` — is eight. Changed to match what exists rather than the other way
 * round: shortening it would have invalidated nothing already stored (a code is
 * compared, not measured) but would have left two lengths in circulation for no
 * reason. `readJoinCodeParam` accepts 4–16, so both survive a link.
 */
export const JOIN_CODE_LENGTH = 8;

/**
 * Why a resident cannot join the village they just picked.
 *
 * The client half of `VILLAGE_JOIN_REFUSALS` in `src/lib/villages.ts`, which says
 * the same things to a hand-crafted POST. Two copies because this one has to
 * render in a Client Component and that one has to sit next to the check it
 * describes; they are three short strings and the alternative is a Client
 * Component importing the server-only village module.
 *
 * `ACTIVE` is empty and unreachable — it is here so `satisfies` keeps the record
 * exhaustive when a status is added to the enum.
 */
export const VILLAGE_JOIN_MESSAGES = {
  PENDING:
    "This village is not yet active. Ask whoever is setting it up to have it activated.",
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
// Covering faces
// ---------------------------------------------------------------------------

export type PrivacyLevelMeta = {
  value: string;
  /** Which of the two covers `src/lib/media/face-blur.ts` paints. */
  mode: FaceRedactionMode;
  /**
   * Gaussian radius in CSS pixels, laid over the mosaic. `0` for `redact`,
   * which reads no source pixels at all and so has nothing to blur.
   */
  radius: number;
  label: string;
  /** One line under the label on the coordinator's selector. */
  detail: string;
};

/**
 * How a village covers faces in the media its residents upload.
 *
 * Set per village on `/dashboard` and stored in `Village.privacyLevel`; read
 * by `MediaUploader`, which hands the mode and the radius to `blurFaces`.
 *
 * ## What the radius does, and what it does not
 *
 * It is the **Gaussian laid over the mosaic**, and only that. Every `blur`
 * level, including `light`, still resamples the padded face box down to
 * `MOSAIC_CELLS` (six across) before anything is drawn back — that resample is
 * what destroys the identity, because the original pixels stop existing
 * anywhere in the output, and it is deliberately not on this scale. So the
 * level a village picks changes how the redaction *looks* and how much of the
 * surrounding composition survives; it does not decide whether a face does.
 *
 * That asymmetry is the point. A coordinator choosing "light" because a PCSO
 * asked for something more legible is making a presentation decision, and the
 * one outcome they must not be able to reach from a settings screen is an
 * upload somebody can be recognised in.
 *
 * `redact` is the strongest and is what the app defaulted to before this was
 * configurable — a solid black box, no source pixels read, nothing to argue
 * about. A reporter can always choose it for their own upload whatever the
 * village is set to; they cannot choose anything weaker.
 */
export const PRIVACY_LEVELS = [
  {
    value: "light",
    mode: "blur",
    radius: 15,
    label: "Light blur (15px)",
    detail:
      "The softest option. Keeps the most of the scene around a face — use it only if your police contact has asked for it.",
  },
  {
    value: "standard",
    mode: "blur",
    radius: 22,
    label: "Standard blur (22px) — recommended",
    detail:
      "The default. Faces are unreadable and you can still see how many people were there and where they stood.",
  },
  {
    value: "heavy",
    mode: "blur",
    radius: 35,
    label: "Heavy blur (35px)",
    detail:
      "A wider smear that spreads well past the face box, so hair, build and clothing at the collar go with it.",
  },
  {
    value: "redact",
    mode: "redact",
    radius: 0,
    label: "Full redact (black box)",
    detail:
      "A solid black rectangle. No pixel of the face is read, so there is nothing left in the file to work back from.",
  },
] as const satisfies readonly PrivacyLevelMeta[];

export type PrivacyLevel = (typeof PRIVACY_LEVELS)[number]["value"];

export const PRIVACY_LEVEL_VALUES = PRIVACY_LEVELS.map((p) => p.value) as [
  PrivacyLevel,
  ...PrivacyLevel[],
];

export const PRIVACY_LEVEL_META = Object.fromEntries(
  PRIVACY_LEVELS.map((p) => [p.value, p]),
) as Record<PrivacyLevel, PrivacyLevelMeta>;

/**
 * The level a village gets when nobody has chosen one.
 *
 * Also the fallback for a value this build does not recognise — see
 * `resolvePrivacyLevel`.
 */
export const DEFAULT_PRIVACY_LEVEL: PrivacyLevel = "standard";

/**
 * Narrows whatever is in the column to a level this build knows about.
 *
 * `Village.privacyLevel` is a `String`, so the database will hold anything a
 * `psql` session puts there, and a level removed in a later release leaves rows
 * behind that still name it. Falling back rather than throwing is what keeps
 * that from being an upload failure — and the fallback is `standard` rather
 * than "no cover", because there is no level in this list that does not cover a
 * face and an unreadable value must not become one.
 *
 * `Object.hasOwn`, not `in`. `PRIVACY_LEVEL_META` is a plain object, so `in`
 * answers true for `toString`, `constructor` and everything else on
 * `Object.prototype` — and this reads a `String` column, which is exactly where
 * one of those could arrive. The lookup that followed would hand a function to
 * the uploader where a level was expected.
 */
export function resolvePrivacyLevel(
  value: string | null | undefined,
): PrivacyLevel {
  return value !== null &&
    value !== undefined &&
    Object.hasOwn(PRIVACY_LEVEL_META, value)
    ? (value as PrivacyLevel)
    : DEFAULT_PRIVACY_LEVEL;
}

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
    value: "compliance.dpia_accepted",
    label: "DPIA accepted",
    description:
      "A coordinator accepted the Data Protection Impact Assessment on the council's behalf",
    /*
      Sensitive, and not because it discloses anything — it discloses nothing.
      It is the row a regulator asks for by name. Article 35 requires the
      assessment before the processing starts, and this is the only record of
      when a particular council adopted it and who signed. Losing it in a wall
      of neutral moderation entries would defeat the point of writing it.
    */
    tone: "sensitive",
  },
  {
    value: "compliance.apd_accepted",
    label: "Appropriate Policy Document accepted",
    description:
      "A coordinator accepted the Appropriate Policy Document, which is what authorises processing criminal offence data at all",
    tone: "sensitive",
  },
  {
    value: "compliance.dpa_accepted",
    label: "Data Processing Agreement accepted",
    description:
      "A coordinator accepted the Article 28(3) data processing agreement with Yakasista Ltd on the council's behalf",
    /*
      Sensitive for the same reason as the other two, and with one difference
      worth knowing when reading the trail: this row is half of a contract. The
      other two documents the council adopts alone; this one is not in force
      until the processor has signed the paper copy as well, and no row here can
      evidence that. What it records is the date the council agreed the terms.
    */
    tone: "sensitive",
  },
  {
    value: "compliance.community_dpa_accepted",
    label: "Community agreement accepted",
    description:
      "A coordinator accepted the Community Coordinator Agreement as the village's own data controller",
    /*
      Sensitive alongside the other three, and the one difference is worth
      knowing when reading the trail: this row is a whole signature rather than
      half of one, and it is signed by the coordinator **for themselves**. The
      council rows record somebody accepting on a body's behalf; this one
      records a person taking on the controller's duties in their own name.
    */
    tone: "sensitive",
  },
  {
    value: "village.mode_changed",
    label: "Compliance model changed",
    description:
      "A village moved from the community model to the parish council model — the data controller changed",
    /*
      Sensitive, and the fifth configuration change in this list. What it
      changes is who is answerable for every report in the village: a subject
      access request, a breach notification and an ICO enquiry all go somewhere
      different afterwards. The trail is the only place the handover date is
      written down, and "when did the council take this on" is exactly the
      question it will be asked.
    */
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
    value: "village.parish_council_changed",
    label: "Parish council changed",
    description:
      "A coordinator changed the body named as data controller for the village",
    // Sensitive, and the third configuration change in this list, though for a
    // different reason from the other two. It widens nothing and removes
    // nobody — what it changes is the organisation named as data controller on
    // the foot of every document that leaves the village for the police or the
    // council, and in the notice a resident reads before exercising a UK GDPR
    // right. Named wrongly, a subject access request goes to a body with no
    // authority to answer it and no record that it was asked.
    tone: "sensitive",
  },
  {
    value: "village.privacy_level_changed",
    label: "Face redaction level changed",
    description:
      "A coordinator changed how faces are covered in media uploaded to the village",
    // Sensitive, and the fourth configuration change in this list. It is the
    // only setting in the app that changes what is left of a person in a file
    // published to the village — and the person it affects is not the reporter
    // and not the coordinator, but whoever was in shot and never chose to be.
    // Moving down the scale weakens that for every upload afterwards, so who
    // did it and when is the question the trail exists to answer. The row
    // carries both levels for the same reason the other three carry their
    // before/after: neither value is personal data and every coordinator can
    // read both on the screen it is posted from.
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
    value: "police.sync",
    label: "Police data updated",
    description:
      "The scheduled job fetched this village's official recorded-crime figures from data.police.uk",
    /*
      Neutral, alongside `retention.sweep`, and for the same reason: nobody did
      it and nothing about the village's own reports changed. It is in the trail
      because the figures it writes end up in a document sent to the police, and
      "where did this number come from, and when was it read" is a question that
      document invites. No personal data is involved in either direction — the
      request carries a map centre and a month, and what comes back is open
      data.
    */
    tone: "neutral",
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

/**
 * Audit actions whose *label* depends on the village reading the trail.
 *
 * One entry, and it is the same seam `ParishCouncilForm` and
 * `saveParishCouncilAction` sit on: `village.parish_council_changed` is the
 * action name, is written to the database, and never changes — but "Parish
 * council changed" is a sentence about a village that has a parish council, and
 * in the community model there is none. A coordinator filtering their own trail
 * for the setting they just changed would be looking for the words their own
 * dashboard used, which are "Data controller".
 *
 * The **stored action is untouched**. Only what a screen calls it moves, which
 * is what keeps a village that upgrades to the council model from having its
 * history relabelled underneath it — the rows say what happened, and the
 * viewer says it in the words the village uses today.
 */
const MODE_AUDIT_LABELS: Partial<
  Record<string, Partial<Record<VillageMode, string>>>
> = {
  "village.parish_council_changed": { community: "Data controller changed" },
};

/**
 * What to call an audit action on screen, in this village's words.
 *
 * Falls back to the action's own label, and then to the stored string — a row
 * written by a build that knew an action this one does not must still be
 * readable, which is the reason `AUDIT_ACTION_META` is a partial record.
 */
export function auditActionLabel(action: string, mode: VillageMode): string {
  return (
    MODE_AUDIT_LABELS[action]?.[mode] ??
    AUDIT_ACTION_META[action]?.label ??
    action
  );
}

/** Rows per page in the audit viewer. */
export const AUDIT_LOG_PAGE_SIZE = 50;

/** How many locations the dashboard calls out as hotspots. */
export const HOTSPOT_COUNT = 3;

// ---------------------------------------------------------------------------
// Looking at a period
// ---------------------------------------------------------------------------

/**
 * The periods the map, the incident list and the dashboard offer.
 *
 * One list for three surfaces, so "Last 30 days" means the same span and
 * carries the same query string wherever a resident meets it. Each surface
 * picks the subset it renders — the map and the list drop `90`, which is longer
 * than either is useful over; the dashboard drops `all`, because a stat card
 * comparing all time against the preceding all time is comparing something with
 * nothing.
 *
 * `days: null` is not one thing. `all` means unbounded and `custom` means the
 * two date inputs decide, which is why `resolveTimeRange` branches on the value
 * rather than on the number being absent.
 *
 * Deliberately separate from `REPORT_RANGES` below. That list is a police
 * liaison meeting and a parish council meeting; this one is a resident reading
 * a map. They agree on 7 and 30 today and there is no reason they must forever —
 * merging them would make a change to one a silent change to the other.
 */
export const TIME_RANGES = [
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "all", label: "All time", days: null },
  { value: "custom", label: "Custom range", days: null },
] as const satisfies readonly {
  value: string;
  label: string;
  days: number | null;
}[];

export type TimeRangePreset = (typeof TIME_RANGES)[number]["value"];

export const TIME_RANGE_VALUES = TIME_RANGES.map((r) => r.value) as [
  TimeRangePreset,
  ...TimeRangePreset[],
];

/** What the map and the incident list offer. Ninety days is the dashboard's. */
export const BROWSE_RANGE_VALUES = ["7", "30", "all", "custom"] as const;

/** What the dashboard offers. `all` is absent — see the note on `TIME_RANGES`. */
export const DASHBOARD_RANGE_VALUES = ["7", "30", "90", "custom"] as const;

/**
 * The preset each surface starts on.
 *
 * Thirty days everywhere, which is what the map already defaulted to and what
 * the dashboard's breakdowns were already hardcoded to. The stat cards are the
 * one thing this changes: "this week" was a fixed seven days and is now the
 * head of the selected period, which is what makes the dropdown mean anything.
 */
export const DEFAULT_TIME_RANGE: TimeRangePreset = "30";

/**
 * The widest custom range these three screens accept, in days.
 *
 * Two years rather than `/reports`' one. That ceiling is there because a report
 * is a document somebody reads end to end; these are a map, a capped list and a
 * set of counts, none of which get longer as the window widens. What the cap is
 * actually for here is stopping a hand-edited URL asking Postgres for a range
 * with no bottom while pretending it is not `all`.
 */
export const MAX_CUSTOM_RANGE_DAYS = 730;

// ---------------------------------------------------------------------------
// Community safety reports
// ---------------------------------------------------------------------------

/**
 * The periods `/reports` offers, plus the custom option.
 *
 * Seven and thirty days are the two meetings a coordinator actually attends: a
 * police liaison call about the week, and a parish council meeting about the
 * month. Ninety days and `year` are the two a coordinator writes rather than
 * attends — a quarterly note to the council, and the figure somebody asks for
 * every January. Anything else is `custom`, which is a date range picker rather
 * than a longer list of presets nobody would read.
 *
 * `days: null` is not one thing, the same trap `TIME_RANGES` has: `year` is
 * bounded and `custom` is whatever the picker says, so `resolveReportRange`
 * branches on the **value** rather than on the number being absent. A preset
 * whose span cannot be written as "n days back from now" has to be computed,
 * and `year` is one — it runs from 1 January, so it is a different length every
 * day of the year.
 */
export const REPORT_RANGES = [
  { value: "7", label: "Last 7 days", days: 7 },
  { value: "30", label: "Last 30 days", days: 30 },
  { value: "90", label: "Last 90 days", days: 90 },
  { value: "year", label: "This year", days: null },
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
 *
 * It bounds the two spans somebody can type — a custom range and `?days=` — and
 * deliberately not the presets. "This year" on 31 December of a leap year is 366
 * days, and clamping a named period to make an arithmetic ceiling come out round
 * would give a coordinator a report a day shorter than the one they asked for,
 * with a notice explaining an adjustment nobody requested.
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

/**
 * Which build this is — `0.1.24`, no leading `v`.
 *
 * `NEXT_PUBLIC_APP_VERSION` is set from `package.json` by `next.config.ts` at
 * build time, so the number on screen is the number `standard-version` wrote
 * into the tag rather than something maintained by hand beside it. An
 * environment variable of the same name set in Vercel wins, which is the escape
 * hatch for a deployment that wants to label itself something else.
 *
 * **Empty is a supported state**, not a bug to fall back from: a build with no
 * variable renders no version rather than a made-up one. `VERSION_LABEL` is
 * empty with it, and every surface tests that before rendering.
 *
 * A wrinkle worth knowing before reading a mismatch as a failed deploy: CI
 * bumps the version *after* a release lands on `main`, in a commit carrying
 * `[skip ci]` — which is what stops Vercel spending a production deploy on a
 * version bump. So production shows the version of the commit it was built
 * from, and `package.json` on `main` is one patch ahead of it until the next
 * real change deploys.
 */
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "";

/** `v0.1.24` for display, or an empty string when the build carries no version. */
export const VERSION_LABEL = APP_VERSION ? `v${APP_VERSION}` : "";
export const APP_DESCRIPTION =
  "Report what you see in seconds. AI strips out personal details, plots it on a live map, and alerts your neighbours when a pattern emerges.";

/**
 * The canonical production origin.
 *
 * `NEXT_PUBLIC_APP_URL` is what every absolute link is actually built from —
 * this is only the fallback for when it is unset, and it is deliberately the
 * real domain rather than `localhost`. The three surfaces that build absolute
 * URLs (a pasted WhatsApp alert, a push deep link, an email) are all read
 * somewhere other than the machine that rendered them, so a missing environment
 * variable used to produce a link that could not work for anybody — and in the
 * WhatsApp case, on a public feed. Failing to the real origin is wrong only on
 * a deployment that is not this one; failing to `localhost` was wrong
 * everywhere but a developer's laptop, where `.env.local` sets it anyway.
 */
export const APP_ORIGIN = "https://villagewatch.app";

/**
 * The same host with no scheme, for the three places that print it as a word
 * rather than link to it: the two legal notices, which name the service by the
 * address a resident types, and the share card.
 *
 * Derived rather than written out again. `CLAUDE.md` has always claimed the
 * domain "appears in the codebase exactly twice" — here and in `.env.example` —
 * and it was written out in four more places, each of which would have carried
 * on naming the old host on the day the domain changed. A privacy notice naming
 * a domain the service no longer answers on is a notice that describes a
 * different service.
 */
export const APP_HOST = APP_ORIGIN.replace(/^https?:\/\//, "");

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
  /**
   * Rendered as-is. Includes the currency and the period.
   *
   * **Optional, and undefined is a tier with no price on the page at all** —
   * not a tier that is free, which is the string "Free". A plan nothing can
   * charge for has no price to state, and inventing one for the layout's sake
   * is a figure a parish clerk budgets against. `cadence` goes with it: a
   * period with no amount in front of it describes nothing.
   */
  price?: string;
  cadence?: string;
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
 *
 * **Which is why Pro states no price.** It carried "£15 per month, per village"
 * for as long as this constant has existed, in the largest type on the section,
 * over a tier the same paragraph calls planned — so the one number a reader
 * takes away from the page was the only thing on it nobody can honour. What is
 * left is the feature list and the button that registers interest, which is the
 * whole of what a preview can truthfully offer. Put a price back when there is
 * something behind it to charge with.
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
    // Written out as `undefined` rather than omitted, the same reason
    // `featured` is written out below: `as const` narrows each entry to its own
    // literal type, so a key that is absent here is absent from the union
    // member and `tier.price` stops type-checking at every call site — the
    // landing page's own render and `structured-data.ts`'s search for the free
    // tier included.
    price: undefined,
    cadence: undefined,
    lede: "For clusters of parishes and anyone answering to a council. Planned — not yet available.",
    features: [
      "Everything in Village",
      "Multiple villages under one coordinator team",
      "Cross-village pattern detection",
      "Email and SMS alongside push",
      "Longer retention and scheduled exports",
      "Priority support",
    ],
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
/**
 * Where a coordinator reaches the people running the service.
 *
 * Deliberately not `DATA_CONTROLLER.email` below, and the distinction is the
 * whole point: the controller is the *council*, and a resident with a data
 * protection question goes to them. This is the **processor** — the address a
 * coordinator uses to report a fault, send the countersigned processing
 * agreement, or ask for a resident to be appointed. Client-safe, so the screens
 * that offer help can name it without restating it.
 */
export const SUPPORT_EMAIL = "info@yakasista.com";

/**
 * The company that runs the service, as distinct from the council that controls
 * the data in it.
 *
 * The split matters and is the same one `DATA_CONTROLLER` below is about: a
 * parish council is the **controller** of its residents' reports and Yakasista
 * is the **processor** acting on its instructions. This constant is what the
 * landing page's `Organization` structured data names — the entity that
 * publishes the site and takes support mail — and it is deliberately not the
 * entity a subject access request goes to. See `docs/DATA_PROCESSING_AGREEMENT.md`.
 *
 * Unlike `DATA_CONTROLLER`, this is real rather than placeholders: it is the
 * same company either way, whereas the council differs per village.
 */
export const OPERATOR = {
  name: "Yakasista Ltd",
  email: SUPPORT_EMAIL,
  country: "GB",
} as const;

// ---------------------------------------------------------------------------
// The two compliance models
// ---------------------------------------------------------------------------

export type VillageModeMeta = {
  value: string;
  /** What the coordinator picks it by. */
  label: string;
  /** Who the data controller is, in four words. */
  controller: string;
  /** One line under the label. */
  summary: string;
  /** What the village has to accept before it can take a report. */
  documents: string;
};

/**
 * Whether a village is run by a parish council or by the people who live in it.
 *
 * `Village.mode`, and the only thing in the app that decides which documents
 * the compliance gate asks for. Both modes are gated; they are gated on
 * different documents, because they have different controllers.
 *
 * ## Why there are two
 *
 * The gate was built for a parish council: a DPIA under Article 35, an
 * Appropriate Policy Document under DPA 2018 Schedule 1 paragraph 5, and an
 * Article 28(3) processing agreement, all accepted by a coordinator **on the
 * council's behalf**. That is the correct set of documents when a council is
 * the controller, and an impossible set when there is no council — which is
 * most neighbourhood watch groups. Six neighbours and a WhatsApp group cannot
 * produce a council's impact assessment, and asking them to is asking them not
 * to start.
 *
 * So `community` makes the **coordinator** the controller, which is what they
 * already are in fact, and gives them one document to read.
 *
 * ## What community mode does not skip
 *
 * The paragraph 5 condition. It is what authorises processing criminal offence
 * data at all, and it attaches to the processing rather than to the kind of
 * organisation doing it — so dropping it would leave a community village with
 * no lawful basis, which is exactly the failure the gate exists to prevent.
 * `docs/COMMUNITY_DPA.md` carries the policy-document content and the Article
 * 28(3) terms in one agreement written for a volunteer. One document, two
 * instruments, no shortcut past either.
 *
 * What community mode genuinely does without is the **Article 35 assessment**,
 * and that is a judgement rather than an omission: Article 35 requires one where
 * processing is likely to result in a high risk, `docs/DPIA.md` concludes that
 * no risk here is rated high after mitigation, and it is the assessment for the
 * service as a whole. A community village runs the same software with the same
 * safeguards. The document stays on the shelf and is linked from the agreement
 * for anybody who wants to read it.
 */
export const VILLAGE_MODES = [
  {
    value: "community",
    label: "Community group",
    controller: "You, the coordinator",
    summary:
      "A neighbourhood group with no parish council behind it. You are the data controller and you accept one agreement.",
    documents: "One document — the Community Coordinator Agreement",
  },
  {
    value: "council",
    label: "Parish or town council",
    controller: "The council",
    summary:
      "A council has taken this village on. It is the data controller, and it accepts the three documents a council is separately obliged to hold.",
    documents: "Three documents — the DPIA, the Appropriate Policy Document and the Data Processing Agreement",
  },
] as const satisfies readonly VillageModeMeta[];

export type VillageMode = (typeof VILLAGE_MODES)[number]["value"];

export const VILLAGE_MODE_VALUES = VILLAGE_MODES.map((m) => m.value) as [
  VillageMode,
  ...VillageMode[],
];

export const VILLAGE_MODE_META = Object.fromEntries(
  VILLAGE_MODES.map((m) => [m.value, m]),
) as Record<VillageMode, VillageModeMeta>;

/**
 * What a village is until somebody says otherwise.
 *
 * `community`, and the direction of that default is the whole feature: a group
 * that has not been asked the question is a group with no council, and the mode
 * that fits them is the one they can actually complete. A `council` default
 * would leave every new village blocked behind three documents nobody has.
 */
export const DEFAULT_VILLAGE_MODE: VillageMode = "community";

/**
 * Narrows whatever is in the column to a mode this build knows about.
 *
 * `Village.mode` is a `String` with no CHECK constraint, so it will hold
 * whatever a `psql` session puts there. Falling back rather than throwing keeps
 * an unrecognised value from becoming a 500 in front of a resident filing a
 * report — and the fallback is `community`, which asks for a document the
 * village can actually produce rather than three it cannot.
 *
 * `Object.hasOwn`, not `in`, for the reason `resolvePrivacyLevel` gives: a plain
 * object answers `in` for `toString` and `constructor`, and this reads a
 * free-text column.
 */
export function resolveVillageMode(
  value: string | null | undefined,
): VillageMode {
  return value !== null &&
    value !== undefined &&
    Object.hasOwn(VILLAGE_MODE_META, value)
    ? (value as VillageMode)
    : DEFAULT_VILLAGE_MODE;
}

/**
 * The documents either model can ask for.
 *
 * Here rather than in `src/lib/compliance-documents.ts` — which is where the
 * files themselves are described — because that module imports `node:fs`, and
 * the gate, the acceptance form and the audit trail all need to know *which*
 * documents a mode calls for without any of them reading one off the disk.
 */
export type ComplianceDocumentId = "dpia" | "apd" | "dpa" | "community";

/**
 * Which documents a village in this mode has to accept.
 *
 * The one place the two-tier model turns into a list, so the screen, the gate
 * and the audit trail cannot disagree about what was asked for.
 *
 * There is deliberately no overlap between the two sets. A community village is
 * not asked for a cut-down council pack, and a council village is not asked to
 * accept an agreement that names a private individual as the controller — the
 * two documents make different people answerable, which is the whole difference
 * between the models.
 */
export function documentsForMode(mode: VillageMode): ComplianceDocumentId[] {
  return mode === "community" ? ["community"] : ["dpia", "apd", "dpa"];
}

/**
 * What being a data controller actually obliges somebody to do, in the words a
 * volunteer needs rather than the words the legislation uses.
 *
 * Rendered on the activation screen and above the community agreement, because
 * in `community` mode the person reading it **is** the controller and nobody
 * has told them what that means. A coordinator accepting an agreement whose
 * consequences they have not been shown is the same failure as a council
 * accepting a summary instead of a document — it looks like a controlled
 * process and stands for nothing.
 *
 * Three duties, not thirty. These are the ones with a clock on them: a subject
 * access request has a deadline, a breach has a shorter one, and the record of
 * processing is the thing the ICO asks for first. Everything else the agreement
 * covers is either done by the software or is a matter of behaving sensibly.
 */
export const CONTROLLER_RESPONSIBILITIES = [
  {
    title: "Answer requests from residents within one month",
    detail:
      "Anyone can ask what you hold about them, ask for it to be corrected, or ask for it to be deleted. You have one calendar month to reply and you cannot charge for it. Most of it is a few clicks — the audit trail shows who read what, and a resident can delete their own reports and close their own account without you.",
  },
  {
    title: "Report a serious breach to the ICO within 72 hours",
    detail:
      "If personal data gets somewhere it should not — a join code posted publicly, a coordinator account taken over, reports sent to the wrong list — you have 72 hours to tell the Information Commissioner, and you must tell the residents affected if the risk to them is high. Tell us at the same time and we will help you work out what was exposed.",
  },
  {
    title: "Keep a record of what the village processes",
    detail:
      "A short written note of what data you hold, why, who else sees it and how long you keep it. The agreement you are accepting is that record for everything the software does; you only have to add anything you do outside it — a paper list of residents, a spreadsheet on a laptop, a WhatsApp group with reports pasted into it.",
  },
] as const;

/**
 * The deployment-wide fallback for the body answerable for a village's data.
 *
 * Placeholders, deliberately and visibly — nothing here is a real body, and
 * `/reports` renders an amber warning while a document would print it. What
 * changed is that the placeholders no longer say **council**.
 *
 * `Village.mode` defaults to `community`, where there is no council and the
 * coordinator is the controller, so "[Parish Council name]" was the wrong
 * question asked of most villages: a volunteer reading it on the foot of their
 * own report is being told to go and find a council, and a coordinator reading
 * it under a field they are meant to fill in learns that the field is not for
 * them. The wording is mode-neutral instead — it names the *role* both models
 * agree on and asks for a name rather than a kind of organisation.
 *
 * Read through `reportController` in `src/lib/community-report.ts`, which
 * prefers `Village.parishCouncil` on a truthiness check. This is what prints
 * when no village-specific controller has been named at all.
 */
export const DATA_CONTROLLER = {
  name: "[Data controller name]",
  addressLines: [
    "[Data controller address line 1]",
    "[Town]",
    "[Postcode]",
  ],
  email: "[contact@example.uk]",
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

// ---------------------------------------------------------------------------
// Police recorded crime (data.police.uk)
// ---------------------------------------------------------------------------

/**
 * The official crime figures VillageWatch shows beside its own.
 *
 * `data.police.uk` is the Home Office's open data service. It publishes, per
 * calendar month, every crime recorded by every Home Office force in England,
 * Wales and Northern Ireland, snapped to an anonymised map point and stripped
 * of everything that could identify anybody. There is no key, no account and no
 * quota — the only thing it asks for is reasonable use, which is what
 * `POLICE_API_MAX_REQUESTS_PER_SECOND` below is.
 *
 * ## What it is for here
 *
 * A coordinator's hardest question at a parish meeting is "is this getting
 * worse, or are we just reporting more of it?", and VillageWatch on its own
 * cannot answer it — its numbers move with how many residents have installed
 * it. The police figures are the independent series. Put beside each other they
 * answer the question; folded together they would answer nothing, which is why
 * they are never folded together. See `POLICE_COMPARISON_NOTE`.
 *
 * ## Why nothing here maps a police category onto `IncidentType`
 *
 * It is the obvious thing to build and it would be wrong. A police
 * "burglary" is a crime an officer recorded after an investigation decision;
 * a VillageWatch `BURGLARY` is what a resident thought they saw at the time.
 * They are counted over different areas, on different definitions, with a
 * two-month gap between them. A single bar chart with both in it invites a
 * reading neither series supports, in a document that goes to the police — so
 * the two breakdowns are rendered side by side and the note between them says
 * what differs.
 */

/** No key, no account, no quota. Everything is under `/api`. */
export const POLICE_API_BASE_URL = "https://data.police.uk/api";

/** Where a reader is sent to check a figure for themselves. */
export const POLICE_DATA_URL = "https://data.police.uk/";

/**
 * The pace every outbound call to data.police.uk is held to.
 *
 * Their documentation asks for no more than 15 requests per second and states
 * no hard quota. **In practice the service is stricter than its own
 * documentation**: the first scheduled run paced at 15/s came back 429
 * `rate_limited` for every village it touched, so the documented figure is a
 * ceiling the service does not itself honour and is not safe to pace against.
 * One request per second is what this is set to, deliberately far under the
 * stated limit — a service that has to start rate limiting us is a service that
 * starts by blocking us, and there is no key here to identify us by if it does.
 *
 * This is a *pace*, not a quota: it costs a slow run and never a wrong figure.
 * `POLICE_SYNC_MAX_REQUESTS` is sized against it — see the note there, because
 * at this pace the pacer rather than the API's latency is what bounds a run.
 */
export const POLICE_API_MAX_REQUESTS_PER_SECOND = 1;

/**
 * How long a single call is given before it is abandoned.
 *
 * Generous, because a month of street-level crime for a busy area is a large
 * JSON body and this runs on a cron with nobody waiting. Bounded, because the
 * sync loops over villages and months inside one 60-second function.
 */
export const POLICE_API_TIMEOUT_MS = 20_000;

/**
 * Identifies us to data.police.uk.
 *
 * An open API with no key has no other way to tell one caller from another, and
 * a service that cannot tell who is misbehaving blocks by IP range. A contact
 * address in the agent is what makes a conversation possible instead.
 */
export const POLICE_API_USER_AGENT = `${APP_NAME}/1.0 (+${APP_ORIGIN}; ${SUPPORT_EMAIL})`;

/**
 * How far behind the present the published data runs.
 *
 * The Home Office releases a month's figures roughly two months after it ends,
 * so a report covering "the last 30 days" will find no official data for most
 * of it. That is not a fault to be worked around, it is a fact to be stated:
 * every surface that renders these figures says which months it actually has.
 */
export const POLICE_DATA_LAG_MONTHS = 2;

/**
 * Months a scheduled sync reaches back over.
 *
 * Six covers the widest period the dashboard offers, gives `/reports` a full
 * quarter of overlap, and lets a month that was empty on first fetch — because
 * it had not been published yet — be picked up on a later run without a backfill
 * script. Months already fetched inside `POLICE_REFRESH_DAYS` are skipped, so
 * the usual run costs one or two calls a village.
 */
export const POLICE_SYNC_MONTHS = 6;

/**
 * How long a stored month is trusted before it is fetched again.
 *
 * The source is monthly, so re-fetching more often than this buys nothing — but
 * it is not zero either, because a month's *outcomes* are revised after
 * publication as investigations close. Thirty days means every month held is
 * refreshed roughly when the next one lands.
 */
export const POLICE_REFRESH_DAYS = 30;

/**
 * Crimes stored for one village-month.
 *
 * The API itself returns a 503 for any point with more than 10,000 crimes in
 * the month, which no village approaches — the search is a one-mile radius of a
 * parish centre. This is the second bound, and it is here because a village
 * beside a town centre could still return thousands and this table has no other
 * ceiling. Exceeding it is reported rather than silently truncated.
 */
export const POLICE_MAX_CRIMES_PER_MONTH = 3_000;

/**
 * Outbound calls one scheduled run will make.
 *
 * It exists so that a deployment which has just activated forty parishes drains
 * over several nights instead of timing out halfway through and leaving no
 * record of where it got to.
 *
 * **This is now sized against the pacer, not against the API's latency**, and
 * the two have to be read together. At the old 15 calls a second the route's 60
 * seconds were never the binding constraint, so 120 was free. At
 * `POLICE_API_MAX_REQUESTS_PER_SECOND` of 1 it is arithmetic: 120 calls is 120
 * seconds of pacing alone inside a function that is killed at `maxDuration`,
 * which is exactly the timed-out-halfway-through failure this constant exists
 * to prevent — and being killed mid-run is the one outcome that leaves no
 * record, because the response that reports where it got to is never sent.
 *
 * 40 leaves 40 seconds of pacing and 20 for the calls themselves, the
 * availability call and the writes. Raise it only alongside `maxDuration` in
 * `src/app/api/cron/police-data/route.ts`, or with the pace.
 */
export const POLICE_SYNC_MAX_REQUESTS = 40;

/**
 * The radius data.police.uk searches around a point, in metres.
 *
 * One mile, and it is theirs rather than ours — the street-level endpoint takes
 * a `lat`/`lng` and applies it. It is not configurable, it does not follow a
 * parish boundary, and it is why these figures cover a different area from
 * everything else in VillageWatch. Stated on every surface that renders them.
 */
export const POLICE_SEARCH_RADIUS_METERS = 1_609;

/**
 * How officers' details are shown, and what is deliberately not stored.
 *
 * The neighbourhood team endpoint returns a `bio` alongside each officer, and
 * it is a block of force-authored HTML. Nothing here stores it: rendering HTML
 * from a third party is a stored-XSS surface that this codebase does not have
 * anywhere else (`MarkdownView` exists precisely so the compliance documents
 * need no `dangerouslySetInnerHTML`), and a paragraph about an officer's
 * hobbies is not what a coordinator opened the dashboard for. Name, rank and
 * a published contact address are.
 */
export const POLICE_TEAM_MAX_MEMBERS = 12;

/**
 * The Open Government Licence acknowledgement, which is a licence condition.
 *
 * data.police.uk is published under OGL v3.0, the same licence the ONS place
 * directory carries, and it asks for this wherever the data is shown — so it
 * belongs under the dashboard panel and in the footer of a report, not only in
 * a credits page nobody opens. `ONS_LICENCE_URL` above is the same licence text
 * and is reused rather than restated.
 */
export const POLICE_ATTRIBUTION =
  "Contains public sector information licensed under the Open Government Licence v3.0. Source: data.police.uk (Home Office).";

/**
 * The sentence that has to travel with every comparison of the two series.
 *
 * One constant, because four surfaces render this comparison — the dashboard,
 * the report on screen, the report on the clipboard and the report as a PDF —
 * and four copies of a caveat is four caveats the day somebody edits one. The
 * same reasoning `GENERATED_BY` and `AI_ANALYSIS_NOTE` are exported from
 * `community-report.ts` on.
 *
 * Every clause in it is load-bearing. The area differs, the definition differs,
 * and the period differs; a recipient who reads "8 police crimes, 3
 * VillageWatch reports" without those three facts has been told something
 * false by arithmetic that is individually correct.
 */
export const POLICE_COMPARISON_NOTE =
  "Police figures are crimes recorded by the force, published monthly by the Home Office about two months in arrears. They cover a one-mile radius of the village centre rather than the parish boundary, and they count recorded crime rather than resident reports — so the two columns are two different measurements of the same place, not the same measurement twice.";

/**
 * Display names for the API's category slugs.
 *
 * The service publishes these itself at `/crime-categories`, and
 * `fetchCrimeCategories` reads them — but a label has to render on a dashboard
 * whose only job is to draw a stored row, and a network call to find out what
 * to call `bicycle-theft` is a network call on a page render. This is the
 * offline copy; anything not in it is title-cased from the slug by
 * `policeCategoryLabel`, so a category the Home Office adds next year renders
 * as "Wildlife Crime" rather than as nothing at all.
 */
export const POLICE_CATEGORY_LABELS: Record<string, string> = {
  "all-crime": "All crime",
  "anti-social-behaviour": "Anti-social behaviour",
  "bicycle-theft": "Bicycle theft",
  burglary: "Burglary",
  "criminal-damage-arson": "Criminal damage and arson",
  drugs: "Drugs",
  "other-theft": "Other theft",
  "possession-of-weapons": "Possession of weapons",
  "public-order": "Public order",
  robbery: "Robbery",
  shoplifting: "Shoplifting",
  "theft-from-the-person": "Theft from the person",
  "vehicle-crime": "Vehicle crime",
  "violent-crime": "Violence and sexual offences",
  "other-crime": "Other crime",
};

/**
 * What to call a category on screen.
 *
 * Falls back to the slug title-cased rather than to the slug itself or to
 * "Unknown". The Home Office has changed this list before — "violent-crime"
 * covered a narrower set of offences until 2013 — and a category added after
 * this constant was written should read as a category, not as a bug.
 */
export function policeCategoryLabel(category: string): string {
  const known = Object.hasOwn(POLICE_CATEGORY_LABELS, category)
    ? POLICE_CATEGORY_LABELS[category]
    : undefined;

  if (known) return known;

  return category
    .split("-")
    .filter(Boolean)
    .map((word, index) =>
      index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word,
    )
    .join(" ");
}

/** How many police categories a comparison lists before it stops. */
export const POLICE_CATEGORY_LIMIT = 6;

/**
 * Whether a month string is one this codebase will accept.
 *
 * `YYYY-MM`, which is the only shape the API uses and the shape stored in
 * `PoliceCrime.month`. Checked rather than assumed because the month reaches
 * the database from a query string on the sync route, and a stored month that
 * is not this shape sorts wrongly against every other row for good.
 */
export function isPoliceMonth(value: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return false;

  const year = Number(value.slice(0, 4));
  return year >= 2010 && year <= 2100;
}

/**
 * `YYYY-MM` for an instant, in UTC.
 *
 * UTC rather than `Europe/London`, and it is the same call `resolveReportRange`
 * makes about its own boundaries: the published data is labelled by calendar
 * month with no zone attached to it, and moving a boundary by an hour would
 * change which month a report at midnight on the 1st was counted in without
 * making any figure more true.
 */
export function policeMonthOf(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Every `YYYY-MM` from `from` to `to` inclusive, oldest first.
 *
 * The months a period overlaps, which is the unit the police data is published
 * in — a report covering 12 July to 5 August needs both months and neither in
 * full. Bounded at 24 so a hand-edited range cannot ask for a thousand.
 */
export function policeMonthsBetween(from: Date, to: Date): string[] {
  const months: string[] = [];

  const cursor = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1),
  );
  const last = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1);

  while (cursor.getTime() <= last && months.length < 24) {
    months.push(policeMonthOf(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return months;
}

/** "July 2026" — a stored `YYYY-MM` as a person reads it. */
export function formatPoliceMonth(month: string): string {
  const [year, index] = month.split("-").map(Number);

  if (!year || !index) return month;

  return new Date(Date.UTC(year, index - 1, 1)).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}
