import { z } from "zod";
import {
  COORDINATOR_APPLICANT_ROLE_VALUES,
  COORDINATOR_REASON_MIN_CHARS,
  DEFAULT_REPORT_RANGE,
  DEFAULT_TIME_RANGE,
  INCIDENT_TYPE_VALUES,
  NOTIFICATION_RADIUS_VALUES,
  PRIVACY_LEVEL_VALUES,
  REPORT_RANGE_VALUES,
  SEVERITY_VALUES,
  TIME_RANGE_VALUES,
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

/**
 * `incidentFilterSchema` used to sit here: cursor pagination, a radius search, a
 * free-text query and a status list, none of which anything ever parsed. The map
 * and the list resolve their period through `src/lib/date-range.ts` and read
 * type and severity straight off a GET form; there is no cursor because neither
 * screen paginates, and no radius search because the map draws every pin it is
 * given. A schema describing an API the app does not have is a description of
 * the wrong app, and it reads as coverage. Removed rather than left to be found
 * by whoever tries to use it.
 */

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

/**
 * Asking for a reset link. Email and nothing else.
 *
 * The screen's response deliberately does not depend on whether the address has
 * an account — see `forgot-password-form.tsx`. Validation here is only about the
 * address being well formed, so the Supabase call is worth making at all.
 */
export const forgotPasswordSchema = z.object({
  email: z.email("Enter a valid email address"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * Choosing a new password, once a recovery link has produced a session.
 *
 * The same `password` rules as registration — a reset is not the place to let a
 * weaker one in, and a resident who cannot meet them at `/register` would be
 * confused to find they can here.
 */
export const resetPasswordSchema = z
  .object({
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    error: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

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
    /**
     * The code from a coordinator. Optional *here* and required by
     * `checkVillageJoin` whenever the village has one — the shape of the field
     * and the rule about it are different questions, and only the server can
     * answer the second: this schema does not know which village was picked, and
     * the handful of rows that predate activation have no code to demand.
     */
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

/**
 * The settings form, which posts strings from a `<form>` rather than JSON.
 *
 * `notifyRadiusMeters` arrives as `""` for village-wide and a checkbox is either
 * `"on"` or absent entirely — neither of which a boolean or a nullable integer
 * will accept without help, which is why the coercion lives in the schema rather
 * than in the action.
 *
 * A `notificationPreferencesSchema` and a `profileSchema` used to sit above it,
 * described as "the shape the rest of the app thinks in". Nothing parsed either
 * of them: `/settings` posts a form and this is what reads it, and the two halves
 * they split the profile into were never assembled anywhere. Both removed.
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
// The village's WhatsApp Channel
// ---------------------------------------------------------------------------

/**
 * `https:` and nothing else.
 *
 * The same test `safeChannelUrl` in `src/lib/whatsapp-channel.ts` applies when
 * the column is read. Both are wanted: this one gives the coordinator an error
 * message under the field, that one still has to run because rows set by hand in
 * the database predate this form and a `javascript:` URL rendered into
 * `/settings` is stored XSS against the whole village.
 *
 * Any origin is accepted. WhatsApp has used both `whatsapp.com` and
 * `chat.whatsapp.com` for invite links, and pinning one breaks the day they add
 * a third.
 */
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Pulls the channel code out of a WhatsApp Channel invite link.
 *
 * The code is the last segment of the link WhatsApp hands a channel owner under
 * "Copy link" — `https://whatsapp.com/channel/0029Va…` — and it is also the
 * address a posting relay writes to. They were two fields on the dashboard until
 * now, which asked a coordinator to find the same string twice and to know that
 * the second one was a credential; the link is the only thing WhatsApp actually
 * gives them, so the code is derived from it here and never typed.
 *
 * Deliberately a loose `match` rather than a `URL` parse: WhatsApp has used both
 * `whatsapp.com` and `chat.whatsapp.com`, links arrive with tracking query
 * strings attached, and residents paste them out of messages. Anything with a
 * recognisable `whatsapp.com/channel/<code>` in it yields the code. The
 * `https:` requirement is a separate check — see `isHttpsUrl` — because this one
 * says nothing about the protocol.
 */
export function extractChannelCode(url: string): string | null {
  const match = url.match(/whatsapp\.com\/channel\/([A-Za-z0-9]+)/);
  return match ? match[1] : null;
}

/**
 * A village join code in the shape the column holds.
 *
 * Case-folded, and spaces and hyphens dropped — a code read off a newsletter
 * arrives as `oak 7x2` or `OAK-7X2` about as often as it arrives clean, and
 * rejecting those teaches residents that the code they were given is wrong.
 * Applied to both sides of the comparison in `checkVillageJoin`, because rows
 * set by hand in psql before that module existed are not guaranteed to be
 * normalised either.
 *
 * It lives here rather than in `src/lib/villages.ts` — where it started — because
 * `src/lib/invite.ts` needs it to build a link in the browser, and `villages.ts`
 * imports `node:crypto` and Prisma. One copy that both sides share, rather than
 * a normalisation the server does and the invite link does not.
 */
export function normalizeJoinCode(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * The coordinator's WhatsApp Channel settings, posted from the dashboard.
 *
 * A `<form>`, so the same two shape problems `settingsFormSchema` has: an empty
 * text field arrives as `""` rather than absent, and an unchecked box does not
 * arrive at all.
 *
 * **`whatsappChannelId` is derived, not posted.** It is the code inside the
 * invite link, so asking for it separately was asking the coordinator to split a
 * string by hand and gave them a way to point the village's public alerts at a
 * channel other than the one residents follow. The transform below is now the
 * only thing that sets that column from the application.
 *
 * Both values are per-village and neither is an env var. Nothing about a channel
 * is platform-level any more — there is no relay account, because there is no
 * API that can post to a Channel (see `src/lib/whatsapp-channel.ts`).
 *
 * The refine at the end is the one rule worth enforcing: `whatsappEnabled` with
 * no channel behind it is a switch that reads as on and does nothing, because
 * `logIncidentAlert` skips with `no_channel`. A coordinator who thinks the
 * village's alerts are being prepared and is not would find out weeks later,
 * from nobody. It points at the link now, because the link is the only field
 * left to correct.
 */
export const villageChannelFormSchema = z
  .object({
    whatsappChannelUrl: z
      .string()
      .trim()
      .max(500, "Keep the invite link under 500 characters")
      .transform((value) => (value === "" ? null : value))
      .refine((value) => value === null || isHttpsUrl(value), {
        error: "Paste the https:// invite link WhatsApp gives you",
      })
      .refine((value) => value === null || extractChannelCode(value) !== null, {
        error:
          "That is not a channel link — it should look like https://whatsapp.com/channel/0029Va…",
      }),
    whatsappEnabled: z
      .union([z.literal("on"), z.literal("")])
      .optional()
      .transform((value) => value === "on"),
    whatsappMinSeverity: z.enum(SEVERITY_VALUES),
  })
  .transform((v) => ({
    ...v,
    whatsappChannelId: v.whatsappChannelUrl
      ? extractChannelCode(v.whatsappChannelUrl)
      : null,
  }))
  .refine((v) => !v.whatsappEnabled || Boolean(v.whatsappChannelId), {
    error: "Add the invite link, or posting will silently do nothing",
    path: ["whatsappChannelUrl"],
  });

export type VillageChannelFormInput = z.output<typeof villageChannelFormSchema>;

/**
 * The village's auto-approve switch, posted from the dashboard.
 *
 * One field, and a schema all the same: an unchecked box is absent from a form
 * payload entirely, so `formData.get()` returns null and a bare `Boolean()` on
 * it would be right by accident rather than on purpose. Stating the two shapes
 * a checkbox can arrive in is what makes "absent means off" a decision.
 *
 * Its own schema rather than a field on `villageChannelFormSchema`, because they
 * are two forms with two save buttons and two audit actions. Merging them would
 * mean a coordinator correcting an invite link could not save without also
 * re-submitting — and so re-confirming — whether the village moderates.
 *
 * No `villageId`. It comes from the session profile server-side (domain rule 4).
 */
// ---------------------------------------------------------------------------
// Village administration
// ---------------------------------------------------------------------------

/**
 * The three things a platform administrator can do to a village from
 * `/admin/villages`.
 *
 * `villageId` **is** in these payloads, unlike everywhere else in this file —
 * and it is the one place that is correct. Domain rule 4 says never trust a
 * village id from a request, because every other screen renders the caller's
 * own village and an id in the body would be a way to reach a neighbouring
 * one. This screen is the deliberate exception: an administrator is
 * platform-wide by definition, acts on villages they are not a member of, and
 * `requireAdmin()` plus the `isPlatformAdmin()` re-check inside
 * `src/lib/villages.ts` is what stands in for the tenant scope here.
 */
export const villageActionSchema = z.object({
  villageId: z.uuid({ error: "Choose a village" }),
});

/** Appointing a coordinator: the village, and who. */
export const villageAppointSchema = z.object({
  villageId: z.uuid({ error: "Choose a village" }),
  email: z.email({ error: "Enter the address they registered with" }),
});

export const villageAutoApproveFormSchema = z.object({
  autoApprove: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((value) => value === "on"),
});

/**
 * Accepting the three compliance documents.
 *
 * Three checkboxes rather than one, and the schema does **not** require all of
 * them: the action decides that, so it can say which box is missing rather than
 * rejecting the whole form with "invalid". `refine` here would turn "you have
 * not ticked the APD" into a validation error with nowhere useful to attach it.
 *
 * The same unchecked-checkbox handling as `villageAutoApproveFormSchema` — an
 * unticked box is absent from the payload entirely, so "missing" has to mean
 * false rather than "leave unchanged". There is no leave-unchanged here anyway:
 * acceptance is one-way (see `acceptCompliance`).
 *
 * No `villageId`. It comes from the caller's session — a village id in this form
 * would be a way to accept a neighbouring parish's legal documents for them.
 */
export const complianceAcceptFormSchema = z.object({
  dpia: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((value) => value === "on"),
  apd: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((value) => value === "on"),
  dpa: z
    .union([z.literal("on"), z.literal("")])
    .optional()
    .transform((value) => value === "on"),
});

/**
 * The village's data controller, as a coordinator types it.
 *
 * Empty becomes `null` rather than `""`, which is what lets `reportController`
 * fall back to the deployment-wide `DATA_CONTROLLER` on a single truthiness
 * check. An empty string stored in the column would satisfy "a value is set"
 * and put a blank where a police report names the body answerable for the data.
 *
 * No format validation beyond a length cap, deliberately. This is the legal
 * name of a real parish, town or community council, and they are not uniform —
 * "Bourn Parish Council", "Cyngor Cymuned Llanddewi", "The Parish Meeting of
 * Croxton". A pattern here would reject somebody's actual council.
 */
/**
 * The village's face redaction level, as a coordinator picks it.
 *
 * A closed enum, unlike `Village.privacyLevel` itself, which is a `String` —
 * this is the only place in the application that writes that column, so the
 * narrowing happens here rather than in a CHECK constraint. An unrecognised
 * value never reaches the database; one that is already in it is narrowed on
 * the way out by `resolvePrivacyLevel`.
 *
 * No `villageId`. It comes from the session profile server-side (domain rule
 * 4) — a village id in this payload would be a way to turn down the redaction
 * on a neighbouring parish's uploads.
 */
export const villagePrivacyLevelFormSchema = z.object({
  privacyLevel: z.enum(PRIVACY_LEVEL_VALUES, {
    error: "Choose one of the privacy levels",
  }),
});

export const villageParishCouncilFormSchema = z.object({
  parishCouncil: z
    .string()
    .trim()
    .max(120, "Keep the council name under 120 characters")
    .transform((value) => value || null),
});

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

// ---------------------------------------------------------------------------
// Coordinator access requests
// ---------------------------------------------------------------------------

/**
 * A resident's application to coordinate their village.
 *
 * Note what is **not** here: no `villageId` and no `userId`. Both are read from
 * the session profile server-side. A village id in this payload would be a way
 * to apply to coordinate somebody else's village (domain rule 4), and a user id
 * would be a way to apply on their behalf.
 *
 * `role` is validated against the offered list but stored as text — it is the
 * standing the applicant claims, not a `UserRole`, and it grants nothing on its
 * own. See `COORDINATOR_APPLICANT_ROLES`.
 */
export const coordinatorRequestSchema = z
  .object({
    role: z.enum(COORDINATOR_APPLICANT_ROLE_VALUES, {
      error: "Choose how you are involved in the village",
    }),
    roleDetail: z
      .string()
      .trim()
      .max(200, "Keep this under 200 characters")
      .optional(),
    reason: z
      .string()
      .trim()
      .min(
        COORDINATOR_REASON_MIN_CHARS,
        `Tell us why in at least ${COORDINATOR_REASON_MIN_CHARS} characters`,
      )
      .max(2000, "Keep your answer under 2000 characters"),
  })
  /**
   * "Something else" with nothing after it is not an application — it is the
   * one option that carries no information at all unless the applicant fills in
   * what it means.
   */
  .refine((v) => v.role !== "OTHER" || Boolean(v.roleDetail?.length), {
    error: "Tell us how you are involved",
    path: ["roleDetail"],
  });

export type CoordinatorRequestInput = z.output<typeof coordinatorRequestSchema>;

/**
 * An administrator's decision on one application.
 *
 * The note is required on a rejection and optional on an approval, because the
 * rejection notification quotes it back to the applicant — "not approved" with
 * no reason attached is the version of this that generates an email to the
 * parish clerk. On an approval there is nothing to explain.
 */
export const coordinatorRequestDecisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"], { error: "Choose a decision" }),
    note: z
      .string()
      .trim()
      .max(1000, "Keep the note under 1000 characters")
      .optional(),
  })
  .refine((v) => v.decision !== "REJECT" || Boolean(v.note?.length), {
    error: "Tell the applicant why, so they know whether to reapply",
    path: ["note"],
  });

export type CoordinatorRequestDecisionInput = z.output<
  typeof coordinatorRequestDecisionSchema
>;

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
 * The narrative section of a community safety report, from
 * `generateReportNarrative`.
 *
 * Deliberately not `weeklyDigestSchema`. The digest is written for residents
 * and carries `advice` — "check your side gates" — which is the wrong register
 * entirely in a document addressed to a police officer, who does not need to be
 * told to lock up. This one is written for the recipient of a report: what the
 * period looked like, what appears to be connected, and where the coordinator
 * suggests attention goes.
 */
export const reportNarrativeSchema = z.object({
  summary: z.string().trim().min(1).max(2000),
  /** Observations that hold across more than one report. Empty is a valid week. */
  patterns: z.array(z.string().trim().min(1).max(300)).max(5).default([]),
  /**
   * One line for the recipient. Nullable rather than defaulted: a period with
   * nothing to suggest should say nothing, and an empty string in a document is
   * a heading with a blank under it.
   */
  recommendation: z.string().trim().max(300).nullable().default(null),
  confidence: z.number().min(0).max(1),
});

export type ReportNarrativeOutput = z.output<typeof reportNarrativeSchema>;

/**
 * The date range behind `/reports`.
 *
 * A GET form, so everything arrives as a string and anything unparseable is
 * dropped rather than rejected — a hand-edited query string should show the
 * default period, not an error page. The ordering and the ceiling are checked
 * in `resolveReportRange`, which has the clock; this only says what the shapes
 * are.
 */
export const reportRangeSchema = z.object({
  range: z.enum(REPORT_RANGE_VALUES).catch(DEFAULT_REPORT_RANGE),
  /** `yyyy-mm-dd` from a date input. Only read when `range` is `custom`. */
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  /**
   * `?days=7` — a whole number of days back from now, and the short form a
   * link uses when it has no form behind it to carry three fields.
   *
   * It wins over `range` where both are present, because a caller that took
   * the trouble to write one meant it. Anything not a positive whole number
   * falls to `undefined` and the other two decide, which is the same
   * forgiveness every field here has: this resolves on a page render, and a
   * stale bookmark should produce a period rather than an error page.
   *
   * Not capped here — `resolveReportRange` clamps it to
   * `REPORT_MAX_RANGE_DAYS` and says so in `notice`. Rejecting it at the
   * schema would silently fall back to a week, which is the wrong answer to
   * "give me five years": it is a report far shorter than asked for, with
   * nothing on it to say so.
   */
  days: z.coerce.number().int().positive().optional().catch(undefined),
});

export type ReportRangeInput = z.output<typeof reportRangeSchema>;

/**
 * The date range behind the map, the incident list and the dashboard.
 *
 * Same shape and the same forgiveness as `reportRangeSchema` above, over
 * `TIME_RANGE_VALUES` rather than the report's three. It is a separate schema
 * because the two lists are separate — see the note on `TIME_RANGES`.
 *
 * `.catch()` on every field is what makes this safe to run on a page render:
 * a stale bookmark or a hand-edited query string resolves to the default
 * period rather than throwing in front of somebody looking at a map.
 */
export const timeRangeSchema = z.object({
  range: z.enum(TIME_RANGE_VALUES).catch(DEFAULT_TIME_RANGE),
  /** `yyyy-mm-dd` from a date input. Only read when `range` is `custom`. */
  from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
});

export type TimeRangeInput = z.output<typeof timeRangeSchema>;

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
