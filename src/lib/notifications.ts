import {
  type CreateNotificationSuccessResponse,
  DefaultApi,
  Notification as OneSignalNotification,
  createConfiguration,
} from "@onesignal/node-onesignal";
import type { Severity } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { adminEmails } from "@/lib/admin";
import { distanceMeters } from "@/lib/geo";
import { formatTimeAgo } from "@/lib/format";
import {
  logIncidentAlert,
  type ChannelAlertResult,
} from "@/lib/whatsapp-channel";
import {
  APP_ORIGIN,
  COORDINATOR_ROLES,
  LOCATION_FUZZ_METERS,
  MAX_PUSH_RECIPIENTS,
  SEVERITY_META,
} from "@/lib/constants";

/**
 * Push delivery via OneSignal. **Server only** — `ONESIGNAL_REST_API_KEY` has
 * no `NEXT_PUBLIC_` prefix, and this module reads every resident's home
 * location to decide who is close enough to care.
 *
 * Three things here are load-bearing:
 *
 * 1. **Nothing throws.** A missing key, a rate limit and a network failure are
 *    all ordinary states. Publishing a report must not fail because a push did
 *    — the incident is on the map either way, and the alert is the extra. With
 *    no key configured the payload is logged and the run reports zero sent,
 *    which is what makes a fresh clone with no OneSignal account usable.
 *
 * 2. **Residents are targeted by external id, never by segment.** The external
 *    id is the Supabase auth user id, set by `OneSignal.login()` in the browser
 *    (see `src/components/push-registration.tsx`). Audience selection therefore
 *    happens here, against the database, where the village boundary and each
 *    resident's own preferences are actually known — a OneSignal segment would
 *    put that decision in a dashboard nobody reviews.
 *
 * 3. **Only the public columns go into a payload.** A notification lands on a
 *    lock screen, which is the least private surface there is.
 *    `rawDescription` never reaches this module (domain rule 1), and the body
 *    is built from `title` and `locationText` only.
 */

/**
 * The app id, taken from the server variable and falling back to the public one.
 *
 * There are two variables holding one value, and that is the failure this
 * fallback exists for. The browser SDK can only read a `NEXT_PUBLIC_` variable,
 * and this module must never read a key that gets inlined into a client bundle
 * — so the app id is configured twice. Setting only the public one is the
 * obvious mistake, and until now it failed *silently*: the browser subscribed
 * devices happily, `isPushConfigured` was false, and every dispatch reported
 * `not_configured` on a deployment that looked fully set up.
 *
 * Falling back means one variable is enough. Setting both to *different* app ids
 * is the genuinely broken state — devices subscribe to one app and the server
 * pushes to another — so that one is warned about rather than papered over.
 */
function resolveAppId(): string {
  const server = process.env.ONESIGNAL_APP_ID?.trim() ?? "";
  const browser = process.env.NEXT_PUBLIC_ONESIGNAL_APP_ID?.trim() ?? "";

  if (server && browser && server !== browser) {
    console.warn(
      "[push:config] ONESIGNAL_APP_ID (%s) and NEXT_PUBLIC_ONESIGNAL_APP_ID " +
        "(%s) name different apps. Devices subscribe to the browser one and " +
        "this server pushes to the other, so nothing can ever be delivered. " +
        "Using the server value.",
      server,
      browser,
    );
  }

  if (!server && browser) {
    console.warn(
      "[push:config] ONESIGNAL_APP_ID is not set; falling back to " +
        "NEXT_PUBLIC_ONESIGNAL_APP_ID. Set both to the same value.",
    );
  }

  return server || browser;
}

const APP_ID = resolveAppId();
const REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY ?? "";

export const isPushConfigured = APP_ID.length > 0 && REST_API_KEY.length > 0;

if (!isPushConfigured) {
  // The one line that tells the two unconfigured states apart. "No push arrived"
  // looks identical whether nothing is set or the REST key alone is missing, and
  // a half-configured deployment is the one worth naming out loud.
  console.warn(
    "[push:config] Push is off — appId=%s restApiKey=%s. Payloads will be " +
      "logged instead of sent.",
    APP_ID ? "set" : "MISSING",
    REST_API_KEY ? "set" : "MISSING",
  );
}

let cached: DefaultApi | null = null;

function getOneSignal(): DefaultApi {
  cached ??= new DefaultApi(createConfiguration({ restApiKey: REST_API_KEY }));
  return cached;
}

/**
 * What OneSignal actually did with a request it answered 200 to.
 *
 * A 200 is not delivery. Two everyday outcomes arrive with a success status and
 * used to be counted here as a full send:
 *
 * - **Every alias unsubscribed.** `errors` is an array of strings, the usual one
 *   being "All included players are not subscribed" — which is what a village
 *   whose residents have all denied the browser prompt looks like, and is also
 *   exactly what a wrong app id looks like.
 * - **Some aliases unknown.** `errors.invalid_aliases.external_id` lists the
 *   external ids OneSignal has no subscription for. Those residents have a
 *   profile and a preference and no device, which is the normal state for anyone
 *   who has not pressed "Turn on alerts".
 *
 * `recipients` is on the wire but not on the generated model, so it is read
 * through a cast and only trusted when it is actually a number.
 */
type OneSignalOutcome = {
  /** Devices OneSignal accepted the notification for. */
  sent: number;
  /** External ids it had no subscription for. */
  unknownAliases: string[];
  /** Set when OneSignal accepted nothing at all. */
  fatal?: string;
};

function readOneSignalResponse(
  response: CreateNotificationSuccessResponse,
  requested: number,
): OneSignalOutcome {
  const errors = response.errors as
    | string[]
    | { invalid_aliases?: { external_id?: string[] } }
    | undefined;

  if (Array.isArray(errors) && errors.length > 0) {
    return { sent: 0, unknownAliases: [], fatal: errors.join("; ") };
  }

  const unknownAliases =
    (errors && !Array.isArray(errors)
      ? errors.invalid_aliases?.external_id
      : undefined) ?? [];

  const reported = (response as { recipients?: number }).recipients;

  return {
    sent:
      typeof reported === "number"
        ? reported
        : Math.max(0, requested - unknownAliases.length),
    unknownAliases,
  };
}

export type DispatchResult = {
  /** Residents the audience rules selected. */
  matched: number;
  /** Residents the push was actually accepted for. Zero when unconfigured. */
  sent: number;
  /** Why nothing was sent, when nothing was. */
  skipped?: "not_configured" | "no_recipients" | "failed";
};

type PushMessage = {
  villageId: string;
  title: string;
  body: string;
  /** Deep link opened when the notification is tapped. Relative to the app. */
  path: string;
  /** Written onto the `Notification` rows this dispatch creates. */
  incidentId?: string;
  patternAlertId?: string;
};

type Recipient = { id: string };

/**
 * Sends one message to a resolved set of residents and records the attempt.
 *
 * The `Notification` rows are written whether or not OneSignal is configured:
 * they are the in-app inbox as much as a delivery log, and a deployment with no
 * push credentials should still be able to show a resident what they missed.
 * `sentAt` and `failedAt` are what distinguish the two cases.
 */
async function dispatch(
  message: PushMessage,
  recipients: readonly Recipient[],
): Promise<DispatchResult> {
  const matched = recipients.length;

  if (matched === 0) {
    return { matched: 0, sent: 0, skipped: "no_recipients" };
  }

  const audience = recipients.slice(0, MAX_PUSH_RECIPIENTS);

  if (audience.length < matched) {
    console.warn(
      "Push audience for village %s truncated from %d to %d recipients",
      message.villageId,
      matched,
      audience.length,
    );
  }

  const url = absoluteUrl(message.path);

  if (!isPushConfigured) {
    // The one branch a fresh clone takes. Logged rather than silent, because
    // "did that alert go out?" is otherwise unanswerable in development.
    console.log(
      "[push:not-configured] %s — %s → %d resident(s) (%s)",
      message.title,
      message.body,
      audience.length,
      url,
    );

    await recordNotifications(message, audience, null);

    return { matched, sent: 0, skipped: "not_configured" };
  }

  // The breadcrumb that answers "did the server even try?". Every id here is a
  // Supabase auth user id, which is the external id the browser called
  // `OneSignal.login()` with — so a dispatch that reports aliases the dashboard
  // has never heard of is a login that did not happen, not a delivery problem.
  console.log(
    "[push:dispatch] app=%s village=%s aliases=%d title=%s url=%s",
    APP_ID,
    message.villageId,
    audience.length,
    message.title,
    url,
  );

  const notification = new OneSignalNotification();
  notification.app_id = APP_ID;
  notification.target_channel = "push";
  // Match on the alias we set at sign-in rather than a subscription id, so a
  // resident who reinstalls or adds a second device keeps working with no
  // bookkeeping on our side.
  notification.include_aliases = { external_id: audience.map((r) => r.id) };
  notification.headings = { en: message.title };
  notification.contents = { en: message.body };
  notification.web_url = url;
  notification.data = {
    incidentId: message.incidentId ?? null,
    patternAlertId: message.patternAlertId ?? null,
    path: message.path,
  };

  let response: CreateNotificationSuccessResponse;

  try {
    response = await getOneSignal().createNotification(notification);
  } catch (cause) {
    // A non-2xx: a bad REST key (401), an app id the key does not own (403), a
    // malformed payload (400). All of them are configuration rather than
    // delivery, and all of them look the same from a resident's phone.
    console.error(
      "[push:error] OneSignal rejected a notification for village %s",
      message.villageId,
      cause,
    );

    await recordNotifications(message, audience, {
      reason: "Push delivery failed",
    });

    return { matched, sent: 0, skipped: "failed" };
  }

  const outcome = readOneSignalResponse(response, audience.length);

  console.log(
    "[push:response] village=%s notificationId=%s sent=%d/%d%s%s",
    message.villageId,
    response.id || "(none)",
    outcome.sent,
    audience.length,
    outcome.unknownAliases.length > 0
      ? ` noSubscription=${outcome.unknownAliases.length}`
      : "",
    outcome.fatal ? ` error=${outcome.fatal}` : "",
  );

  if (outcome.fatal) {
    // A 200 that delivered nothing. Reported as a failure rather than counted as
    // a full send, because the number this returns is what a coordinator is told
    // after approving a report — "42 residents alerted" when none were is worse
    // than saying none were.
    await recordNotifications(message, audience, { reason: outcome.fatal });

    return { matched, sent: 0, skipped: "failed" };
  }

  await recordNotifications(
    message,
    audience,
    outcome.unknownAliases.length > 0
      ? {
          reason: "No subscribed device for this account",
          ids: new Set(outcome.unknownAliases),
        }
      : null,
  );

  return { matched, sent: outcome.sent };
}

/**
 * One `Notification` row per resident. Best effort: the push has already gone
 * out by this point, so a database failure here must not turn a delivered alert
 * into a thrown error upstream.
 *
 * `failure.ids`, when present, narrows the failure to those recipients and marks
 * everyone else as sent — which is what a partial delivery actually is. Omitting
 * it means the whole batch failed. Passing `null` means the whole batch went.
 */
async function recordNotifications(
  message: PushMessage,
  recipients: readonly Recipient[],
  failure: { reason: string; ids?: ReadonlySet<string> } | null,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const now = new Date();

  const failed = (id: string) =>
    failure !== null && (failure.ids === undefined || failure.ids.has(id));

  try {
    await prisma.notification.createMany({
      data: recipients.map((recipient) => ({
        userId: recipient.id,
        incidentId: message.incidentId,
        patternAlertId: message.patternAlertId,
        title: message.title,
        body: message.body,
        channel: "push",
        url: message.path,
        sentAt: failed(recipient.id) ? null : now,
        failedAt: failed(recipient.id) ? now : null,
        failureReason: failed(recipient.id) ? failure!.reason : null,
      })),
    });
  } catch (cause) {
    console.error("Could not record notification delivery", cause);
  }
}

function absoluteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? APP_ORIGIN;
  return new URL(path, base).toString();
}

// ---------------------------------------------------------------------------
// Audience selection
// ---------------------------------------------------------------------------

type NotifiableIncident = {
  id: string;
  villageId: string;
  title: string;
  severity: Severity;
  locationText: string | null;
  lat: number | null;
  lng: number | null;
  occurredAt: Date;
  /**
   * The anonymised public column, and the pattern note beside it. Optional
   * because the two callers that only need a push — `POST /api/notifications`
   * re-sending an alert, and the digest — have no reason to select them. They
   * reach the channel alert and nothing else; `lat`, `lng` and the reporter
   * never do (see `AlertIncident`).
   */
  description?: string;
  recurring?: boolean;
  patternNote?: string | null;
};

/**
 * Residents of the village who want to hear about this incident.
 *
 * Three filters, in the order they get cheaper to evaluate:
 *
 * - **Village.** The tenant boundary (domain rule 4).
 * - **Preference.** `notifyPush`, and a severity at least as high as the
 *   resident's floor.
 * - **Distance.** Applied in JavaScript rather than SQL because it needs
 *   `LOCATION_FUZZ_METERS` folded in, and because a village's user table is
 *   small enough that the round trip is not worth a PostGIS query.
 *
 * Anyone the distance test cannot be run against — no home location on file, or
 * an incident filed without coordinates — is **included**. The radius is a way
 * to hear less, not a filter that should silently drop an alert because we do
 * not know where someone lives.
 */
async function residentsToNotify(
  incident: NotifiableIncident,
): Promise<Recipient[]> {
  if (!process.env.DATABASE_URL) return [];

  const minWeight = SEVERITY_META[incident.severity].weight;

  const candidates = await prisma.user.findMany({
    where: {
      villageId: incident.villageId,
      // A closed account keeps its row so the audit trail and `reporterId` still
      // resolve (see `eraseAccount()`), but it is nobody's phone any more.
      deletedAt: null,
      notifyPush: true,
      notifyMinSeverity: {
        in: Object.values(SEVERITY_META)
          .filter((meta) => meta.weight <= minWeight)
          .map((meta) => meta.value),
      },
    },
    select: {
      id: true,
      homeLat: true,
      homeLng: true,
      notifyRadiusMeters: true,
    },
  });

  return candidates.filter((user) => {
    if (user.notifyRadiusMeters === null) return true;
    if (incident.lat === null || incident.lng === null) return true;
    if (user.homeLat === null || user.homeLng === null) return true;

    const distance = distanceMeters(
      { lat: user.homeLat, lng: user.homeLng },
      { lat: incident.lat, lng: incident.lng },
    );

    // The stored point was jittered by up to `LOCATION_FUZZ_METERS` on the way
    // in (domain rule 2), so a strict comparison would drop incidents that
    // really are inside the radius. Widening by the fuzz is the honest reading
    // of "within 200m" against a coordinate deliberately known to be imprecise.
    return distance <= user.notifyRadiusMeters + LOCATION_FUZZ_METERS;
  });
}

// ---------------------------------------------------------------------------
// The messages themselves
// ---------------------------------------------------------------------------

/**
 * "🔴 Burglary reported — Oak Lane, 12 minutes ago"
 *
 * Severity leads, because on a lock screen it is the only thing that will be
 * read. Location and time follow because they are what decides whether the
 * reader gets up.
 */
function incidentBody(incident: NotifiableIncident): string {
  const parts = [incident.title];

  if (incident.locationText) parts.push(incident.locationText);
  parts.push(formatTimeAgo(incident.occurredAt));

  return parts.join(" — ");
}

/** A publish reaches two surfaces; this reports on both. */
export type PublishDispatchResult = DispatchResult & {
  /** The village's public WhatsApp Channel, when it has one turned on. */
  channel: ChannelAlertResult;
};

/**
 * Alerts the village that a report has been published.
 *
 * Called after a coordinator approves a report, never at report time: an
 * unreviewed report has not cleared the moderation queue and must not reach
 * residents (domain rule 6).
 *
 * Two surfaces, and they are not equivalent — nor are they both automatic any
 * more. Push goes to residents of this village who asked for it, and it is sent
 * here. The WhatsApp Channel is public to anyone holding the invite link, and
 * **nothing is sent to it from here**: there is no API that posts to a Channel,
 * so `logIncidentAlert` writes the alert to the server log and a coordinator
 * copies the same text from `/dashboard` or the incident page and pastes it.
 * The relay POST that used to sit here is gone — see
 * `src/lib/whatsapp-channel.ts`.
 *
 * Neither call can throw, so neither can stop the other or fail a publish.
 */
export async function notifyIncidentPublished(
  incident: NotifiableIncident,
): Promise<PublishDispatchResult> {
  const recipients = await residentsToNotify(incident);

  const push = await dispatch(
    {
      villageId: incident.villageId,
      title: `${SEVERITY_META[incident.severity].emoji} ${SEVERITY_META[incident.severity].label} alert`,
      body: incidentBody(incident),
      path: `/incidents/${incident.id}`,
      incidentId: incident.id,
    },
    recipients,
  );

  const channel = await logIncidentAlert({
    id: incident.id,
    villageId: incident.villageId,
    title: incident.title,
    severity: incident.severity,
    // Never `lat`, `lng` or the reporter — `AlertIncident` has no field that
    // could carry them.
    description: incident.description ?? "",
    locationText: incident.locationText,
    occurredAt: incident.occurredAt,
    recurring: incident.recurring,
    patternNote: incident.patternNote,
  });

  return { ...push, channel };
}

/**
 * Tells one reporter what a coordinator decided about their report.
 *
 * Sent regardless of `notifyPush`: this is the outcome of something they
 * personally submitted, not village news, and someone who muted broadcast
 * alerts has not asked to stop hearing about their own report.
 */
export async function notifyReporterOfDecision(input: {
  villageId: string;
  reporterId: string | null;
  incidentId: string;
  reference: string;
  published: boolean;
  note?: string | null;
}): Promise<DispatchResult> {
  if (!input.reporterId) return { matched: 0, sent: 0, skipped: "no_recipients" };

  const body = input.published
    ? `${input.reference} is now on the village map.`
    : input.note
      ? `${input.reference} was not published. ${input.note}`
      : `${input.reference} was not published. Your coordinator can explain why.`;

  return dispatch(
    {
      villageId: input.villageId,
      title: input.published ? "✅ Your report is live" : "Your report was reviewed",
      body,
      path: `/incidents/${input.incidentId}`,
      incidentId: input.incidentId,
    },
    [{ id: input.reporterId }],
  );
}

/**
 * Tells the village's coordinators that a report is waiting on them.
 *
 * Sent when a report lands in `PENDING_REVIEW` — so never in a village that has
 * turned auto-approve on, where there is no queue to join and the village-wide
 * broadcast has already gone out.
 *
 * Coordinators only, and not filtered by `notifyPush`, radius or
 * `notifyMinSeverity`, for the same reason the weekly digest is not: those three
 * are how a *resident* asks to hear less village news, and this is not village
 * news. It is work assigned to the person who volunteered to do it, and a
 * report nobody was told about sits in the queue until somebody happens to open
 * the dashboard.
 *
 * **The title is all that travels.** No description, anonymised or otherwise:
 * a push body lands on a lock screen, which is the least private surface in the
 * app, and a coordinator is one tap from the queue where the full report is.
 */
export async function notifyCoordinatorsOfPendingReport(input: {
  villageId: string;
  incidentId: string;
  reference: string;
  title: string;
  severity: Severity;
  /** The reporter, so their own filing does not buzz their own phone. */
  reporterId: string | null;
}): Promise<DispatchResult> {
  if (!process.env.DATABASE_URL) {
    return { matched: 0, sent: 0, skipped: "no_recipients" };
  }

  const coordinators = await prisma.user.findMany({
    where: {
      villageId: input.villageId,
      deletedAt: null,
      role: { in: [...COORDINATOR_ROLES] },
      // A coordinator filing their own report already knows about it, and
      // being pushed your own submission reads as a bug.
      ...(input.reporterId ? { id: { not: input.reporterId } } : {}),
    },
    select: { id: true },
  });

  return dispatch(
    {
      villageId: input.villageId,
      title: `📥 ${SEVERITY_META[input.severity].label} report awaiting review`,
      body: `${input.reference} — ${input.title}`,
      path: "/dashboard",
      incidentId: input.incidentId,
    },
    coordinators,
  );
}

// ---------------------------------------------------------------------------
// Coordinator access requests
// ---------------------------------------------------------------------------

/**
 * Tells the platform's administrators that somebody has applied to coordinate.
 *
 * **Not village-scoped, and it is the one dispatch here that is not.** Every
 * other audience in this module is "residents of village X", because that is
 * the tenant boundary. An application is the opposite shape: the whole point of
 * the seeded village directory is that a village can exist with nobody in it
 * who could review anything, so the reviewers are the platform's admins
 * wherever they happen to live. `message.villageId` below therefore names the
 * village being *applied for*, not the recipients' own — it is used for the log
 * line and nothing else.
 *
 * The applicant's name is in the body. That is their own name, attached to
 * their own application, going to the people who have to decide it; none of the
 * personal data rules that govern an incident payload are in play.
 *
 * The audience is resolved from `ADMIN_EMAILS`, matching the gate on
 * `/admin/coordinators` — pushing to `role: "ADMIN"` would alert people who
 * cannot open the queue and skip the people who can. An administrator with no
 * profile row is simply not found here and gets nothing, which is the same
 * degradation as any other resident who has not finished signing up.
 */
export async function notifyAdminsOfCoordinatorRequest(input: {
  villageId: string;
  villageName: string;
  applicantName: string;
}): Promise<DispatchResult> {
  if (!process.env.DATABASE_URL) {
    return { matched: 0, sent: 0, skipped: "no_recipients" };
  }

  const emails = adminEmails();

  if (emails.length === 0) {
    return { matched: 0, sent: 0, skipped: "no_recipients" };
  }

  // Case-insensitively, and therefore as an OR of `equals` rather than one
  // `in`: Prisma's `in` takes no `mode`, and `User.email` is stored as the
  // registrant typed it while `ADMIN_EMAILS` is normalised to lower case. An
  // administrator who signed up as `Info@…` and was configured as `info@…`
  // would otherwise be silently missing from every alert.
  const admins = await prisma.user.findMany({
    where: {
      deletedAt: null,
      OR: emails.map((email) => ({
        email: { equals: email, mode: "insensitive" as const },
      })),
    },
    select: { id: true },
  });

  return dispatch(
    {
      villageId: input.villageId,
      title: "📥 New coordinator request",
      body: `${input.applicantName} has applied to coordinate ${input.villageName}.`,
      path: "/admin/coordinators",
    },
    admins,
  );
}

/**
 * Tells one applicant what an administrator decided.
 *
 * Sent regardless of `notifyPush`, on the same reasoning as
 * `notifyReporterOfDecision`: this is the outcome of something they personally
 * submitted and waited on, not village news. Somebody who muted broadcast
 * alerts has not asked to stop hearing about their own application.
 *
 * A rejection carries the reviewer's note, because "declined" on its own leaves
 * the applicant with nothing to act on and no idea whether reapplying is worth
 * it. The note is written by an administrator to be read by the applicant —
 * `coordinatorRequestDecisionSchema` requires one for exactly this line.
 */
export async function notifyApplicantOfCoordinatorDecision(input: {
  villageId: string;
  userId: string;
  approved: boolean;
  note?: string | null;
}): Promise<DispatchResult> {
  const body = input.approved
    ? "Your coordinator application has been approved. You now have access to the moderation dashboard."
    : input.note
      ? `Your coordinator application was not approved. Reason: ${input.note} You can reapply from Settings.`
      : "Your coordinator application was not approved. You can reapply from Settings.";

  return dispatch(
    {
      villageId: input.villageId,
      title: input.approved
        ? "✅ You are now a coordinator"
        : "Your coordinator application was reviewed",
      body,
      // Approved lands them on the thing they just got; declined lands them
      // where the reapply button is.
      path: input.approved ? "/dashboard" : "/settings",
    },
    [{ id: input.userId }],
  );
}

/**
 * Sends the weekly digest to the people who act on it.
 *
 * Coordinators only, and not filtered by `notifyPush` or radius — the digest is
 * a working document for the village's moderators rather than a broadcast, and
 * it summarises the whole village by definition.
 */
export async function notifyCoordinatorsOfDigest(input: {
  villageId: string;
  patternAlertId: string;
  title: string;
  summary: string;
}): Promise<DispatchResult> {
  if (!process.env.DATABASE_URL) {
    return { matched: 0, sent: 0, skipped: "no_recipients" };
  }

  const coordinators = await prisma.user.findMany({
    where: {
      villageId: input.villageId,
      deletedAt: null,
      role: { in: [...COORDINATOR_ROLES] },
    },
    select: { id: true },
  });

  return dispatch(
    {
      villageId: input.villageId,
      title: `📋 ${input.title}`,
      // A push body is truncated by the OS anyway; sending the whole summary
      // would just be paying to have it cut off mid-sentence.
      body: truncate(input.summary, 240),
      path: "/dashboard",
      patternAlertId: input.patternAlertId,
    },
    coordinators,
  );
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}
