import { z } from "zod";
import {
  INCIDENT_TYPE_VALUES,
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

/**
 * Payload submitted by the report wizard.
 *
 * `description` is the reporter's own words — it is stored as
 * `Incident.rawDescription` and only reaches the public `description` column
 * after the anonymisation pass. Never echo this straight back to the map.
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

    description: z
      .string()
      .trim()
      .min(20, "Describe what happened in at least 20 characters")
      .max(4000, "Keep the description under 4000 characters"),

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
  })
  .refine((v) => !v.reportedToPolice || Boolean(v.policeReference?.length), {
    error: "Add the reference the police gave you",
    path: ["policeReference"],
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
    acceptTerms: z.literal(true, {
      error: "You must accept the terms to create an account",
    }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type RegisterInput = z.infer<typeof registerSchema>;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export const notificationPreferencesSchema = z.object({
  notifyPush: z.boolean(),
  notifyEmail: z.boolean(),
  notifySms: z.boolean(),
  notifyMinSeverity: z.enum(SEVERITY_VALUES),
});

export const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(80),
  phone: z.string().trim().max(24).optional(),
  addressLine: z.string().trim().max(160).optional(),
  homeLat: latitude.optional(),
  homeLng: longitude.optional(),
});

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
