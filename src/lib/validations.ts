import { z } from "zod";
import {
  INCIDENT_TYPE_VALUES,
  NOTIFICATION_RADIUS_VALUES,
  SEVERITY_VALUES,
  PUBLIC_INCIDENT_STATUSES,
} from "@/lib/constants";

/**
 * Zod 4 schemas. Note the v4 idioms used throughout:
 *   - top-level formats: `z.email()`, `z.uuid()` (not `z.string().email()`)
 *   - `{ error: "..." }` replaces `required_error` / `invalid_type_error`
 *   - `z.record()` requires two arguments: `z.record(keyType, valueType)`
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const latitude = z
  .number({ error: "Latitude is required" })
  .min(-90, "Latitude must be between -90 and 90")
  .max(90, "Latitude must be between -90 and 90");

const longitude = z
  .number({ error: "Longitude is required" })
  .min(-180, "Longitude must be between -180 and 180")
  .max(180, "Longitude must be between -180 and 180");

const password = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(72, "Passwords cannot be longer than 72 characters")
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v), {
    error: "Include both upper and lower case letters",
  })
  .refine((v) => /\d/.test(v), { error: "Include at least one number" });

// ---------------------------------------------------------------------------
// Incident reporting
// ---------------------------------------------------------------------------

/** One blurred attachment, as returned by `POST /api/incidents/media`. */
export const incidentMediaSchema = z.object({
  storagePath: z.string().min(1).max(400),
  thumbnailPath: z.string().min(1).max(400),
  mimeType: z.string().min(1).max(100),
  fileSize: z.number().int().positive(),
  width: z.number().int().positive().max(10_000),
  height: z.number().int().positive().max(10_000),
  durationSeconds: z.number().int().min(0).max(600).optional(),
  /**
   * Required rather than defaulted: the blur pipeline always knows this number,
   * and a default would let a caller omit it and have "0 faces" recorded as if
   * detection had actually run.
   */
  facesDetected: z.number().int().min(0).max(200),
});

export type IncidentMediaInput = z.output<typeof incidentMediaSchema>;

// ---------------------------------------------------------------------------
// AI structuring
// ---------------------------------------------------------------------------

/** One AI-extracted keyword. Lowercase so the tag cloud does not fragment. */
export const incidentTagSchema = z
  .string()
  .trim()
  .min(2, "Tags need at least two characters")
  .max(32, "Keep tags under 32 characters")
  .transform((value) => value.toLowerCase());

/**
 * What Claude returns from `structureIncident`, in the wire shape the model is
 * constrained to by `output_config.format`.
 *
 * The keys are snake_case because that is what the JSON schema declares and
 * what the model emits. Renaming them on the way in would mean two names for
 * the same field either side of one function call.
 *
 * Structured outputs already guarantee the shape, so this is a second pair of
 * eyes rather than the only one — but it is what catches a value that is
 * well-formed and still wrong, like a 4001-character description or a date the
 * model invented in the future.
 */
export const structuredIncidentSchema = z.object({
  type: z.enum(INCIDENT_TYPE_VALUES),
  severity: z.enum(SEVERITY_VALUES),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4000),
  /** Count only. The prompt forbids anything that identifies a person. */
  people_count: z.number().int().min(0).max(500).nullable(),
  tags: z.array(incidentTagSchema).max(5).default([]),
  /** ISO 8601, or null when the report gave nothing to go on. */
  occurred_at: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), "Not a usable timestamp")
    .nullable(),
  location_name: z.string().trim().max(200),
  recurring: z.boolean(),
  pattern_note: z.string().trim().max(300).nullable(),
  /** 0–1. Stored as `Incident.aiConfidence`; shown to coordinators, not residents. */
  confidence: z.number().min(0).max(1),
});

export type StructuredIncident = z.output<typeof structuredIncidentSchema>;

/**
 * Body of `POST /api/incidents/process`.
 *
 * `lat`/`lng` are the reporter's exact pin, because the 200m pattern lookup has
 * to run against the real point to be worth anything. They are used for that
 * query and nothing else — the route never writes them, and the publish route
 * fuzzes independently (domain rule 2).
 */
export const incidentProcessSchema = z.object({
  description: z
    .string()
    .trim()
    .min(20, "Describe what happened in at least 20 characters")
    .max(4000, "Keep the description under 4000 characters"),
  type: z.enum(INCIDENT_TYPE_VALUES).optional(),
  severity: z.enum(SEVERITY_VALUES).optional(),
  occurredAt: z.coerce.date().optional(),
  lat: latitude,
  lng: longitude,
  locationText: z.string().trim().max(200).optional(),
  /**
   * Storage path of one already-blurred still to send alongside the text. It is
   * checked against the caller's own `{villageId}/{userId}/` prefix before it is
   * fetched — a path is not proof of ownership.
   */
  mediaPath: z.string().trim().max(400).optional(),
});

export type IncidentProcessInput = z.input<typeof incidentProcessSchema>;

/**
 * Provenance for a report that went through the AI pass, sent back by the
 * wizard at publish time.
 *
 * It is reporter-supplied and therefore **advisory, not an access decision**.
 * A crafted request could claim a report was anonymised when it was not; what
 * stops that mattering is that every report lands in `PENDING_REVIEW` and only
 * a coordinator can publish it. This tells the coordinator what to expect, it
 * does not decide who sees what.
 */
export const incidentAiMetaSchema = z.object({
  model: z.string().trim().min(1).max(80),
  confidence: z.number().min(0).max(1).optional(),
  peopleCount: z.number().int().min(0).max(500).optional(),
  recurring: z.boolean().default(false),
  patternNote: z.string().trim().max(300).optional(),
});

/**
 * Payload submitted by the report wizard.
 *
 * Two description fields, and the distinction is domain rule 1:
 *   - `rawDescription` is the reporter's verbatim words. Stored as
 *     `Incident.rawDescription`, restricted to the reporter, coordinators and
 *     moderators, never served publicly.
 *   - `description` is what the map and list will show — Claude's anonymised
 *     rewrite, after the reporter has read and possibly edited it.
 *
 * `rawDescription` is optional so a report filed without the AI pass still
 * works: the reporter's own words then fill both columns, and the report sits
 * in `PENDING_REVIEW` where nothing serves it.
 */
export const incidentReportSchema = z
  .object({
    type: z.enum(INCIDENT_TYPE_VALUES, {
      error: "Choose what happened",
    }),
    severity: z.enum(SEVERITY_VALUES, {
      error: "Choose how serious this is",
    }),

    title: z
      .string()
      .trim()
      .min(5, "Give the report a short title")
      .max(120, "Keep the title under 120 characters"),

    /**
     * The public text. Only has to be non-empty: when it is Claude's rewrite a
     * terse two-liner is a good outcome, and the substance rule below is
     * enforced against the reporter's own words instead.
     */
    description: z
      .string()
      .trim()
      .min(1, "The report needs a description")
      .max(4000, "Keep the description under 4000 characters"),

    rawDescription: z
      .string()
      .trim()
      .min(1)
      .max(4000, "Keep the description under 4000 characters")
      .optional(),

    occurredAt: z.coerce
      .date({ error: "When did this happen?" })
      .refine((d) => d.getTime() <= Date.now() + 60_000, {
        error: "The date cannot be in the future",
      })
      .refine((d) => d.getTime() > Date.now() - 365 * 24 * 60 * 60 * 1000, {
        error: "Reports older than a year cannot be submitted here",
      }),

    lat: latitude,
    lng: longitude,
    locationText: z
      .string()
      .trim()
      .max(200, "Keep the landmark under 200 characters")
      .optional(),

    isAnonymous: z.boolean().default(false),
    reportedToPolice: z.boolean().default(false),
    policeReference: z
      .string()
      .trim()
      .max(60, "Keep the police reference under 60 characters")
      .optional(),

    /**
     * Media the wizard already blurred and uploaded, described well enough to
     * build the `IncidentMedia` rows without re-decoding anything server-side.
     *
     * `storagePath` is checked against the caller's own `{villageId}/{userId}/`
     * prefix before anything is written — a path is not proof of ownership.
     */
    media: z
      .array(incidentMediaSchema)
      .max(6, "You can attach up to 6 files")
      .default([]),

    /** AI-extracted keywords, reviewed by the reporter. Written to `IncidentTag`. */
    tags: z.array(incidentTagSchema).max(5).default([]),

    /** Present only when the report went through `POST /api/incidents/process`. */
    ai: incidentAiMetaSchema.optional(),
  })
  .refine((v) => !v.reportedToPolice || Boolean(v.policeReference?.length), {
    error: "Add the reference the police gave you",
    path: ["policeReference"],
  })
  /**
   * "Say something useful" belongs on whichever field holds the reporter's own
   * words — `rawDescription` when there was a rewrite, `description` when there
   * was not. Putting it on `description` alone would either reject a good short
   * rewrite or, once relaxed, let a five-character report through.
   */
  .refine((v) => (v.rawDescription ?? v.description).length >= 20, {
    error: "Describe what happened in at least 20 characters",
    path: ["description"],
  });

export type IncidentReportInput = z.input<typeof incidentReportSchema>;
export type IncidentReport = z.output<typeof incidentReportSchema>;

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * The same rules as `incidentReportSchema`, shaped for the report wizard.
 *
 * It exists because `<input type="datetime-local">` yields a string and
 * `z.coerce.date()` accepts `unknown`, which makes react-hook-form's field
 * types useless. Keeping `occurredAt` a validated string here means the form is
 * typed end to end; the wizard converts it to a `Date` when it posts, where
 * `incidentReportSchema` checks it again server-side. The client copy is a
 * convenience — the server one is the rule.
 */
export const incidentFormSchema = z
  .object({
    type: z.enum(INCIDENT_TYPE_VALUES, { error: "Choose what happened" }),
    severity: z.enum(SEVERITY_VALUES, { error: "Choose how serious this is" }),

    title: z
      .string()
      .trim()
      .min(5, "Give the report a short title")
      .max(120, "Keep the title under 120 characters"),

    description: z
      .string()
      .trim()
      .min(20, "Describe what happened in at least 20 characters")
      .max(4000, "Keep the description under 4000 characters"),

    /**
     * The text that will actually be published, held separately from the
     * reporter's own words above.
     *
     * Empty until the AI pass returns (or until it fails, at which point the
     * wizard copies `description` across). Keeping them apart is what lets the
     * reporter step back to "What happened" and still see what *they* wrote,
     * rather than the rewrite of it.
     */
    publicDescription: z
      .string()
      .trim()
      .max(4000, "Keep the description under 4000 characters"),

    /** AI-extracted keywords the reporter can prune before publishing. */
    tags: z.array(incidentTagSchema).max(5),

    occurredAt: z
      .string()
      .min(1, "When did this happen?")
      .refine((v) => !Number.isNaN(Date.parse(v)), {
        error: "Enter a valid date and time",
      })
      .refine((v) => Date.parse(v) <= Date.now() + 60_000, {
        error: "The date cannot be in the future",
      })
      .refine((v) => Date.parse(v) > Date.now() - YEAR_MS, {
        error: "Reports older than a year cannot be submitted here",
      }),

    lat: latitude,
    lng: longitude,
    locationText: z
      .string()
      .trim()
      .max(200, "Keep the landmark under 200 characters"),

    isAnonymous: z.boolean(),
    reportedToPolice: z.boolean(),
    policeReference: z
      .string()
      .trim()
      .max(60, "Keep the police reference under 60 characters"),

    media: z
      .array(incidentMediaSchema)
      .max(6, "You can attach up to 6 files"),
  })
  .refine((v) => !v.reportedToPolice || v.policeReference.length > 0, {
    error: "Add the reference the police gave you",
    path: ["policeReference"],
  });

export type IncidentFormValues = z.infer<typeof incidentFormSchema>;

/**
 * Metadata that rides alongside a blurred upload on `POST /api/incidents/media`.
 *
 * The file itself arrives as multipart form data; these are the numbers the
 * browser already worked out while blurring, so the server does not have to
 * decode the media again to fill in `IncidentMedia`. They are reporter-supplied
 * and therefore only ever used for display — never for an access decision.
 */
export const mediaUploadMetaSchema = z.object({
  kind: z.enum(["image", "video"]),
  width: z.coerce.number().int().positive().max(10_000),
  height: z.coerce.number().int().positive().max(10_000),
  durationSeconds: z.coerce.number().int().min(0).max(600).optional(),
  /** Peak faces covered in any single frame. Shown back to the reporter. */
  facesDetected: z.coerce.number().int().min(0).max(200).default(0),
});

export type MediaUploadMeta = z.output<typeof mediaUploadMetaSchema>;

/** Query params for the map and the incident list. */
export const incidentFilterSchema = z.object({
  types: z.array(z.enum(INCIDENT_TYPE_VALUES)).optional(),
  severities: z.array(z.enum(SEVERITY_VALUES)).optional(),
  statuses: z
    .array(z.enum(PUBLIC_INCIDENT_STATUSES))
    .default([...PUBLIC_INCIDENT_STATUSES]),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Free-text search across title, description and tags. */
  q: z.string().trim().max(120).optional(),
  /** Radius search around a point, in metres. */
  near: z.object({ lat: latitude, lng: longitude }).optional(),
  radiusMeters: z.number().int().min(50).max(50_000).default(5_000),
  cursor: z.uuid().optional(),
  limit: z.number().int().min(1).max(100).default(25),
});

export type IncidentFilter = z.output<typeof incidentFilterSchema>;

/** Coordinator action on a report sitting in the moderation queue. */
export const incidentModerationSchema = z.object({
  incidentId: z.uuid(),
  action: z.enum(["PUBLISH", "REJECT", "RESOLVE", "ARCHIVE"]),
  note: z.string().trim().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  /** Path to return to after signing in. Relative only — never an open redirect. */
  next: z
    .string()
    .startsWith("/", "Redirect target must be a relative path")
    .refine((v) => !v.startsWith("//"), {
      error: "Redirect target must be a relative path",
    })
    .optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your name")
      .max(80, "Keep your name under 80 characters"),
    email: z.email("Enter a valid email address"),
    password,
    confirmPassword: z.string(),
    villageId: z.uuid({ error: "Choose your village" }),
    /** Optional code from a coordinator that auto-verifies the resident. */
    joinCode: z.string().trim().max(24).optional(),
    addressLine: z
      .string()
      .trim()
      .max(160, "Keep the address under 160 characters")
      .optional(),
    phone: z
      .string()
      .trim()
      .max(24, "Keep the phone number under 24 characters")
      .optional(),
    /**
     * The approximate area the resident pinned on the map at registration.
     *
     * Optional, and the notification radius degrades to village-wide without it
     * — a radius is a way to hear less, and someone who declines to say where
     * they live should hear more, not nothing. Jittered by
     * `HOME_LOCATION_FUZZ_METERS` on the server before it is stored, so what
     * lands in `User.homeLat`/`homeLng` is never the point they tapped.
     */
    homeLat: latitude.optional(),
    homeLng: longitude.optional(),
    acceptTerms: z.literal(true, {
      error: "You must accept the terms to create an account",
    }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  })
  /**
   * One coordinate without the other is a bug on the way in, not a half-known
   * location — a stored `homeLat` with a null `homeLng` would fail the distance
   * test silently on every alert.
   */
  .refine((v) => (v.homeLat === undefined) === (v.homeLng === undefined), {
    error: "Drop a pin on the map, or leave it blank",
    path: ["homeLat"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Finishing an account that arrived through an identity provider.
 *
 * Google gives us a verified email and a display name and nothing else that
 * matters here — no village, no join code, no acceptance of the terms. So the
 * fields below are `registerSchema` minus everything the provider already
 * settled: no email, because it comes from the verified JWT and a client-
 * supplied one would let somebody claim an address they do not own, and no
 * password, because there is not one.
 *
 * `fullName` stays, prefilled from the Google profile and editable — the name
 * on a Google account is often not the name a neighbour would recognise.
 */
export const completeProfileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your name")
      .max(80, "Keep your name under 80 characters"),
    villageId: z.uuid({ error: "Choose your village" }),
    joinCode: z.string().trim().max(24).optional(),
    addressLine: z
      .string()
      .trim()
      .max(160, "Keep the address under 160 characters")
      .optional(),
    phone: z
      .string()
      .trim()
      .max(24, "Keep the phone number under 24 characters")
      .optional(),
    homeLat: latitude.optional(),
    homeLng: longitude.optional(),
    acceptTerms: z.literal(true, {
      error: "You must accept the terms to join your village",
    }),
  })
  .refine((v) => (v.homeLat === undefined) === (v.homeLng === undefined), {
    error: "Drop a pin on the map, or leave it blank",
    path: ["homeLat"],
  });

export type CompleteProfileInput = z.infer<typeof completeProfileSchema>;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const notificationPreferencesSchema = z.object({
  notifyPush: z.boolean(),
  notifyEmail: z.boolean(),
  notifySms: z.boolean(),
  notifyMinSeverity: z.enum(SEVERITY_VALUES),
  /**
   * Null means village-wide. Constrained to the offered radii rather than any
   * integer: the number ends up in a distance filter, and an arbitrary value
   * would be a preference no screen can show back to the resident.
   */
  notifyRadiusMeters: z
    .union([z.null(), z.literal(NOTIFICATION_RADIUS_VALUES)])
    .default(null),
});

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(24).optional(),
  addressLine: z.string().trim().max(160).optional(),
  homeLat: latitude.optional(),
  homeLng: longitude.optional(),
});

/**
 * The settings form, which posts strings from a `<form>` rather than JSON.
 *
 * Kept separate from the two schemas above so those stay the shape the rest of
 * the app thinks in. Here `notifyRadiusMeters` arrives as `""` for village-wide
 * and a checkbox is either `"on"` or absent entirely — neither of which a
 * boolean or a nullable integer will accept without help.
 */
export const settingsFormSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your name")
    .max(80, "Keep your name under 80 characters"),
  addressLine: z
    .string()
    .trim()
    .max(160, "Keep the street or area under 160 characters")
    .optional(),
  notifyPush: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((value) => value === "on"),
  notifyMinSeverity: z.enum(SEVERITY_VALUES),
  notifyRadiusMeters: z
    .string()
    .transform((value) => (value === "" ? null : Number(value)))
    .refine(
      (value) =>
        value === null ||
        (NOTIFICATION_RADIUS_VALUES as readonly number[]).includes(value),
      { error: "Choose one of the offered distances" },
    ),
});

export type SettingsFormInput = z.output<typeof settingsFormSchema>;

// ---------------------------------------------------------------------------
// Moderation and editing
// ---------------------------------------------------------------------------

/**
 * The reporter's own edit of a report that has not been published.
 *
 * Deliberately narrower than `incidentReportSchema`: media, tags, coordinates
 * and the AI provenance block are all left alone. Re-running the anonymisation
 * pass over an edited description is a wizard job, so this edits the public
 * `description` directly and leaves `rawDescription` — the reporter's original
 * words — exactly as filed.
 */
export const incidentEditSchema = z.object({
  title: z
    .string()
    .trim()
    .min(5, "Give the report a short title")
    .max(120, "Keep the title under 120 characters"),
  description: z
    .string()
    .trim()
    .min(20, "Describe what happened in at least 20 characters")
    .max(4000, "Keep the description under 4000 characters"),
  type: z.enum(INCIDENT_TYPE_VALUES, { error: "Choose what happened" }),
  severity: z.enum(SEVERITY_VALUES, { error: "Choose how serious this is" }),
  locationText: z
    .string()
    .trim()
    .max(200, "Keep the landmark under 200 characters")
    .optional(),
});

/** Structured weekly summary returned by `generateWeeklyDigest`. */
export const weeklyDigestSchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(1500),
  /** One line per notable location. Empty when nothing clustered. */
  hotspots: z
    .array(
      z.object({
        location: z.string().trim().min(1).max(200),
        note: z.string().trim().min(1).max(300),
      }),
    )
    .max(5)
    .default([]),
  /** Plain, practical, and addressed to residents. Never alarmist. */
  advice: z.array(z.string().trim().min(1).max(200)).max(3).default([]),
  severity: z.enum(SEVERITY_VALUES),
  confidence: z.number().min(0).max(1),
});

export type WeeklyDigest = z.output<typeof weeklyDigestSchema>;

/**
 * Formats a ZodError into `{ field: message }` for rendering next to inputs.
 * Zod 4 exposes `.issues`; `.errors` was removed.
 */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    result[key] ??= issue.message;
  }
  return result;
}
