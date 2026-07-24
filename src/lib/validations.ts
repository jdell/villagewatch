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

    /** Supabase Storage paths for media already uploaded by the wizard. */
    mediaPaths: z
      .array(z.string().min(1))
      .max(6, "You can attach up to 6 files")
      .default([]),
  })
  .refine((v) => !v.reportedToPolice || Boolean(v.policeReference?.length), {
    error: "Add the reference the police gave you",
    path: ["policeReference"],
  });

export type IncidentReportInput = z.input<typeof incidentReportSchema>;
export type IncidentReport = z.output<typeof incidentReportSchema>;

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
