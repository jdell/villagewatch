import {
  type CreateNotificationSuccessResponse,
  DefaultApi,
  Notification as OneSignalNotification,
  createConfiguration,
} from "@onesignal/node-onesignal";
import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { adminEmails } from "@/lib/admin";
import { distanceMeters } from "@/lib/geo";
import { formatTimeAgo } from "@/lib/format";
import { sendBulkEmail, type BulkEmailDispatchResult } from "@/lib/email/send";
import { incidentNotificationEmail } from "@/lib/email/incident-notification";
import {
  weeklyDigestEmail,
  type WeeklyDigestEmailInput,
} from "@/lib/email/weekly-digest";
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
 * Push delivery via OneSignal, and the email fan-out beside it. **Server
 * only** — `ONESIGNAL_REST_API_KEY` has no `NEXT_PUBLIC_` prefix, and this
 * module reads every resident's home location and email address to decide who
 * is close enough to care.
 *
 * **Both channels resolve their audience here, and that is the point.** The
 * rules — village, then preference, then distance, with the coordinate fuzz
 * folded in — are the same for a push and an email, and a second copy of them
 * in `src/lib/email/` would be a second place for "within 200m" to mean
 * something slightly different. What differs between the two is one column
 * (`notifyPush` against `notifyEmail`) and the transport, so that is all that
 * is written twice. The templates stay pure functions and the transport stays
 * `src/lib/email/send.ts`; this module decides *who*.
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

  return candidates.filter((user) => wantsAtThisDistance(user, incident));
}

/**
 * Whether an incident is close enough to a resident's home to be worth telling
 * them about.
 *
 * Shared by the push audience and the email one, because "within 200m" has to
 * mean the same thing on both — two copies of this test would differ the first
 * time somebody adjusted one.
 *
 * Anyone it cannot be run against — no home location on file, or an incident
 * filed without coordinates — is **included**. The radius is a way to hear
 * less, not a reason to silently drop an alert because we do not know where
 * somebody lives.
 */
function wantsAtThisDistance(
  user: {
    homeLat: number | null;
    homeLng: number | null;
    notifyRadiusMeters: number | null;
  },
  incident: { lat: number | null; lng: number | null },
): boolean {
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
}

/**
 * The same audience as {@link residentsToNotify}, on the other column.
 *
 * `notifyEmail` rather than `notifyPush`, and an address selected alongside the
 * id. Everything else is deliberately identical — the same village boundary,
 * the same severity floor, the same distance test — because the two are the
 * same alert down two pipes, and a resident whose radius meant one thing to
 * their phone and another to their inbox would have no way to make sense of
 * either setting.
 *
 * **Push is not a precondition.** An early draft of the email template called
 * itself "the email a resident gets when push could not reach them", which
 * would mean asking OneSignal who it failed to deliver to and emailing the
 * remainder — a delivery report that arrives asynchronously, long after this
 * request has returned, for residents who mostly have no subscription at all
 * rather than a failed one. The two preferences are independent, they are
 * presented that way in `/settings`, and a resident who ticks both has asked
 * for both.
 */
async function residentsToEmail(
  incident: NotifiableIncident,
): Promise<{ id: string; email: string }[]> {
  if (!process.env.DATABASE_URL) return [];

  const minWeight = SEVERITY_META[incident.severity].weight;

  const candidates = await prisma.user.findMany({
    where: {
      villageId: incident.villageId,
      // A closed account keeps its row so the audit trail and `reporterId`
      // still resolve (see `eraseAccount()`), but it is nobody's inbox any
      // more. Belt and braces: that function keeps `email` — it is the row's
      // unique key and the Supabase auth row holds the same address anyway —
      // and excludes the account from this query three times over, by nulling
      // `villageId`, setting `deletedAt` and setting `notifyEmail` to false.
      deletedAt: null,
      notifyEmail: true,
      notifyMinSeverity: {
        in: Object.values(SEVERITY_META)
          .filter((meta) => meta.weight <= minWeight)
          .map((meta) => meta.value),
      },
    },
    select: {
      id: true,
      email: true,
      homeLat: true,
      homeLng: true,
      notifyRadiusMeters: true,
    },
  });

  return candidates
    .filter((user) => wantsAtThisDistance(user, incident))
    .map((user) => ({ id: user.id, email: user.email }));
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
 * What an email needs that a push does not.
 *
 * A lock screen gets a severity, a title and a landmark; an inbox gets the
 * anonymised description, the reference somebody quotes on the phone to 101,
 * and the village's name in the subject line, because an email is read in a
 * list of forty others and none of the surrounding context is on screen.
 *
 * `description` is **required** here where {@link NotifiableIncident} leaves it
 * optional. The two callers that only wanted a push had no reason to select it;
 * an email that omitted it would be a worse copy of the push, and there would
 * be nothing on the type to say so.
 */
export type EmailableIncident = NotifiableIncident & {
  villageName: string;
  reference: string;
  type: IncidentType;
  /** The anonymised public column. Never `rawDescription` (domain rule 1). */
  description: string;
};

/**
 * Emails the village that a report has been published.
 *
 * The third surface a publish reaches, beside the push and the WhatsApp
 * Channel's log line — and, unlike those two, it is deliberately **not** folded
 * into {@link notifyIncidentPublished}. That function has three callers and
 * only two of them are a publish: `POST /api/notifications` is a coordinator
 * re-sending an alert OneSignal dropped, and a re-send that also mailed the
 * whole village a second copy of a report they read yesterday would turn a
 * repair into a nuisance. Push can be repeated; an email cannot be unsent.
 *
 * So the two genuine publish transitions call this themselves —
 * `applyModeration`'s PUBLISH branch and `announce()` in `POST /api/incidents`
 * for a village running auto-approve — which is the same pair that writes the
 * `incident.publish` audit row.
 *
 * **It cannot throw**, on {@link sendBulkEmail}'s contract and for the reason
 * `announce()` needs: it runs inside a reference-clash retry loop where an
 * exception would be read as a P2002 and file the report a second time.
 *
 * No `Notification` rows are written. That table is the in-app inbox and is
 * written by `dispatch()` for the push covering this same incident; a second
 * row per resident would show every resident the same alert twice on a screen
 * that is meant to be a list of what happened.
 */
export async function emailIncidentPublished(
  incident: EmailableIncident,
): Promise<BulkEmailDispatchResult> {
  const recipients = await residentsToEmail(incident);

  if (recipients.length === 0) {
    return { matched: 0, sent: 0, skipped: "no_recipients" };
  }

  // Rendered once and reused. The message is identical for every recipient —
  // nothing in it is personalised — so rendering per resident would be five
  // hundred passes over the same template to produce five hundred identical
  // strings.
  const message = incidentNotificationEmail({
    villageName: incident.villageName,
    incidentId: incident.id,
    reference: incident.reference,
    type: incident.type,
    severity: incident.severity,
    title: incident.title,
    description: incident.description,
    locationText: incident.locationText,
    occurredAt: incident.occurredAt,
    patternNote: incident.patternNote,
  });

  const result = await sendBulkEmail(
    recipients.map((recipient) => ({ to: recipient.email, message })),
  );

  console.log(
    "[email:incident] village=%s reference=%s matched=%d sent=%d%s",
    incident.villageId,
    incident.reference,
    result.matched,
    result.sent,
    result.skipped ? ` skipped=${result.skipped}` : "",
  );

  return result;
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

/**
 * Emails the weekly digest to the people who act on it.
 *
 * The same audience as {@link notifyCoordinatorsOfDigest} and the same message,
 * at the length a push cannot carry: the operating system truncates a
 * notification body at roughly a sentence, which is enough for "come and look"
 * and useless as the thing a coordinator takes to a parish council meeting.
 * That is what the digest is for, and it is why the email exists rather than
 * being a duplicate of the push.
 *
 * **Not filtered by `notifyEmail`, and that is a decision rather than an
 * oversight.** It is the same reasoning `notifyCoordinatorsOfDigest` gives for
 * ignoring `notifyPush`: those columns are how a *resident* asks to hear less
 * village news, and the digest is not village news — it is a working document
 * for the village's moderators, sent to people who volunteered for the job.
 * Honouring the preference on one channel and not the other would also mean the
 * same weekly summary arriving or not depending on which pipe it came down,
 * which is not a distinction anybody could act on. Residents are unaffected:
 * the audience is coordinators only.
 *
 * Cannot throw, on {@link sendBulkEmail}'s contract — one village's digest must
 * not take down the sweep for every village after it.
 */
export async function emailCoordinatorsOfDigest(input: {
  villageId: string;
  digest: WeeklyDigestEmailInput;
}): Promise<BulkEmailDispatchResult> {
  if (!process.env.DATABASE_URL) {
    return { matched: 0, sent: 0, skipped: "no_recipients" };
  }

  const coordinators = await prisma.user.findMany({
    where: {
      villageId: input.villageId,
      deletedAt: null,
      role: { in: [...COORDINATOR_ROLES] },
    },
    select: { email: true },
  });

  if (coordinators.length === 0) {
    return { matched: 0, sent: 0, skipped: "no_recipients" };
  }

  const message = weeklyDigestEmail(input.digest);

  const result = await sendBulkEmail(
    coordinators.map((coordinator) => ({ to: coordinator.email, message })),
  );

  console.log(
    "[email:digest] village=%s matched=%d sent=%d%s",
    input.villageId,
    result.matched,
    result.sent,
    result.skipped ? ` skipped=${result.skipped}` : "",
  );

  return result;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}
