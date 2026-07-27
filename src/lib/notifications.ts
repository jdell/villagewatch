import {
  DefaultApi,
  Notification as OneSignalNotification,
  createConfiguration,
} from "@onesignal/node-onesignal";
import type { Severity } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { distanceMeters } from "@/lib/geo";
import { formatTimeAgo } from "@/lib/format";
import {
  postIncidentToChannel,
  type ChannelPostResult,
} from "@/lib/whatsapp-channel";
import {
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

const APP_ID = process.env.ONESIGNAL_APP_ID ?? "";
const REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY ?? "";

export const isPushConfigured = APP_ID.length > 0 && REST_API_KEY.length > 0;

let cached: DefaultApi | null = null;

function getOneSignal(): DefaultApi {
  cached ??= new DefaultApi(createConfiguration({ restApiKey: REST_API_KEY }));
  return cached;
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

  try {
    await getOneSignal().createNotification(notification);
  } catch (cause) {
    // Includes the everyday case of every alias in the batch being unsubscribed,
    // which OneSignal reports as an error rather than a zero-recipient success.
    console.error(
      "OneSignal rejected a notification for village %s",
      message.villageId,
      cause,
    );

    await recordNotifications(message, audience, "Push delivery failed");

    return { matched, sent: 0, skipped: "failed" };
  }

  await recordNotifications(message, audience, null);

  return { matched, sent: audience.length };
}

/**
 * One `Notification` row per resident. Best effort: the push has already gone
 * out by this point, so a database failure here must not turn a delivered alert
 * into a thrown error upstream.
 */
async function recordNotifications(
  message: PushMessage,
  recipients: readonly Recipient[],
  failureReason: string | null,
): Promise<void> {
  if (!process.env.DATABASE_URL) return;

  const now = new Date();

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
        sentAt: failureReason ? null : now,
        failedAt: failureReason ? now : null,
        failureReason,
      })),
    });
  } catch (cause) {
    console.error("Could not record notification delivery", cause);
  }
}

function absoluteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
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

/** A publish fans out to two surfaces; this reports on both. */
export type PublishDispatchResult = DispatchResult & {
  /** The village's public WhatsApp Channel, when it has one turned on. */
  channel: ChannelPostResult;
};

/**
 * Alerts the village that a report has been published.
 *
 * Called after a coordinator approves a report, never at report time: an
 * unreviewed report has not cleared the moderation queue and must not reach
 * residents (domain rule 6).
 *
 * Two surfaces, and they are not equivalent. Push goes to residents of this
 * village who asked for it; the WhatsApp Channel is public to anyone holding
 * the invite link, so it is off unless the village turned it on and carries a
 * headline rather than the report. See `src/lib/whatsapp-channel.ts`.
 *
 * They run in sequence rather than concurrently on purpose: push is the one
 * residents rely on, and it should not queue behind a third-party relay's
 * timeout. Neither can throw, so neither can stop the other.
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

  const channel = await postIncidentToChannel({
    id: incident.id,
    villageId: incident.villageId,
    title: incident.title,
    severity: incident.severity,
    locationText: incident.locationText,
    occurredAt: incident.occurredAt,
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
    where: { villageId: input.villageId, role: { in: [...COORDINATOR_ROLES] } },
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
