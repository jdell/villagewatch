import type { Severity } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  appBaseUrl,
  formatIncidentAlert,
  type AlertIncident,
} from "@/lib/format-alert";
import { extractChannelCode } from "@/lib/validations";
import { SEVERITY_META } from "@/lib/constants";

/**
 * A village's WhatsApp Channel: the follow link residents see, and the alert
 * text a coordinator posts to it. **Server only** — it reads `Village` rows.
 *
 * ## Nothing here posts anything, and that is now the design
 *
 * Meta's WhatsApp Cloud API sends messages to phone numbers; it has **no
 * endpoint that posts to a Channel**. Channels are a broadcast surface Meta
 * expects a human to post to from the app, and there is no sanctioned
 * programmatic path. Third-party relays (Whapi and similar) do it by driving the
 * WhatsApp Web protocol, which can breach WhatsApp's terms and get the number
 * behind it banned.
 *
 * This module used to POST to whatever endpoint `WHATSAPP_CHANNEL_API_URL`
 * named, on the theory that a deployment might wire one up. None ever did, and
 * the outcome of that was a feature whose success path had never run once: every
 * publish took the unconfigured branch, logged, and reported
 * `skipped: "not_configured"`. **The relay is gone.** What is left is the shape
 * that was always doing the work — resolve the village's channel, decide whether
 * this incident clears its threshold, and write the alert to the log — plus a
 * "Copy to WhatsApp" button on the surfaces a coordinator already uses, which is
 * the honest version of "post this to the channel" when the posting is a person
 * with a clipboard. `src/lib/format-alert.ts` is the shared format, so the text
 * in the log and the text on the clipboard are the same text.
 *
 * **The follow link never needed a relay.** `Village.whatsappChannelUrl` is a
 * public invite link a coordinator pastes in on `/dashboard`; `/settings`
 * renders it and residents follow the channel in the app. That half is
 * officially supported, works with zero configuration, and is the half most
 * villages will actually use.
 *
 * ## The channel is the village's
 *
 * Both halves of a channel's identity — the public invite link and the code that
 * addresses it — live on the `Village` row, and a coordinator supplies only the
 * first: the code is the last segment of the link, so the dashboard asks for the
 * link alone and `extractChannelCode` derives the rest. Nothing about *which*
 * channel is an environment variable, because a deployment serves many villages
 * and each one runs its own.
 *
 * ## A channel is public, and that changes the rules
 *
 * Every other surface in VillageWatch is behind `requireSession()` and scoped to
 * one village (domain rule 4). A channel is not: anyone holding the invite link
 * can follow it — a neighbouring parish, a local paper, whoever a resident
 * forwards it to. Enabling this is the one place the app discloses beyond the
 * tenant boundary, so:
 *
 * - **It is off unless a village turns it on.** `Village.whatsappEnabled`
 *   defaults to false.
 * - **It has its own severity floor**, `whatsappMinSeverity`, defaulting to
 *   HIGH rather than the LOW that push defaults to. A missing cat does not
 *   belong on a public feed.
 * - **`AlertIncident` has no field that could carry `rawDescription`, `lat`
 *   or `lng`** — the same structural guard `IncidentEmailInput` uses. A leak
 *   here is not recallable: a channel post is forwarded, screenshotted and
 *   indexed, and deleting it does not un-send it.
 * - `locationText` **is** included, and is the one field whose audience widens
 *   when a coordinator enables this. It is the anonymised public landmark
 *   ("the lane behind the village hall"), and an alert with no place in it is
 *   not an alert. Flagged here rather than buried, because it is the trade the
 *   coordinator is actually making.
 *
 * ## Nothing throws
 *
 * Same contract as `src/lib/notifications.ts`. Publishing a report must never
 * fail because of anything in here — the incident is on the map and the push
 * has gone out either way.
 *
 * No `Notification` rows are written. That table is one row per user per
 * delivery and a channel post has no recipient list — nobody knows who follows
 * a channel, which is rather the point of one.
 *
 * No `AuditLog` row either. The alert is a deterministic consequence of
 * `incident.publish` plus the village's own configuration, both of which are
 * already in the trail; a second row per alert would say nothing the first does
 * not and would bury the human actions around it.
 */

export type ChannelAlertResult = {
  /** Whether the alert was written to the server log for this village. */
  logged: boolean;
  /** Why nothing was logged, when nothing was. */
  skipped?: "village_disabled" | "no_channel" | "below_threshold";
};

/**
 * A village's channel configuration.
 *
 * `url` is public and safe to render. `id` is the code that addresses the
 * channel. It is the last segment of `url` and not a secret in any meaningful
 * sense — anyone holding the invite link holds it too — but it stays server-side
 * out of habit rather than need: no screen has a reason to show it except the
 * dashboard form, which derives its own preview from the link.
 */
export type VillageChannel = {
  url: string | null;
  id: string | null;
  enabled: boolean;
  minSeverity: Severity;
};

/**
 * The code to post to, given what is actually stored on the row.
 *
 * A saved-through-the-dashboard village has `whatsappChannelId` equal to the
 * code in its link — the form derives one from the other. The fallback is for
 * every other way a row got here: these columns predate the screen and were set
 * by hand in psql for as long as they have existed, and a village with a link
 * and an empty id would otherwise be a channel that is configured, enabled, and
 * silently skipped with `no_channel`. The stored id still wins when there is
 * one, so a hand-set code nobody has re-saved keeps working.
 */
function channelCode(id: string | null, url: string | null): string | null {
  if (id) return id;
  return url ? extractChannelCode(url) : null;
}

/**
 * Reads one village's channel settings.
 *
 * Exported because `/settings` needs `url` to render the follow link, and this
 * module is the only place that knows these columns exist.
 */
export async function getVillageChannel(
  villageId: string,
): Promise<VillageChannel | null> {
  if (!process.env.DATABASE_URL) return null;

  let village;

  try {
    village = await prisma.village.findUnique({
      where: { id: villageId },
      select: {
        whatsappChannelUrl: true,
        whatsappChannelId: true,
        whatsappEnabled: true,
        whatsappMinSeverity: true,
      },
    });
  } catch (cause) {
    // These four columns arrive with a migration that has not been run
    // anywhere yet, so a deployment pointed at an older database throws here on
    // every publish. Caught rather than propagated: this function is awaited
    // inside `applyModeration`, and a missing WhatsApp column must not be able
    // to fail a coordinator's approval of a report.
    console.error("Could not read the channel config for village %s", villageId, cause);
    return null;
  }

  if (!village) return null;

  return {
    url: safeChannelUrl(village.whatsappChannelUrl),
    id: channelCode(village.whatsappChannelId, village.whatsappChannelUrl),
    enabled: village.whatsappEnabled,
    minSeverity: village.whatsappMinSeverity,
  };
}

/**
 * The raw column values, for the screen that edits them and the audit row that
 * records the change.
 *
 * Distinct from `getVillageChannel` in two ways that matter. `url` is **not**
 * put through `safeChannelUrl`: a coordinator whose village has a bad link in
 * that column needs to see the bad link in the field in order to correct it —
 * blanking it would tell them the setting is empty and lose what is stored on
 * the next save. Rendering it into a text input is safe; rendering it into an
 * `href` is what `safeChannelUrl` guards, and that path still goes through
 * `getVillageChannel`. And `id` is **not** put through `channelCode`: this is
 * the `before` half of the audit trail, which has to say what was in the column
 * rather than what the posting path would have made of it.
 */
export async function getVillageChannelSettings(
  villageId: string,
): Promise<VillageChannel | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: {
        whatsappChannelUrl: true,
        whatsappChannelId: true,
        whatsappEnabled: true,
        whatsappMinSeverity: true,
      },
    });

    if (!village) return null;

    return {
      url: village.whatsappChannelUrl,
      id: village.whatsappChannelId,
      enabled: village.whatsappEnabled,
      minSeverity: village.whatsappMinSeverity,
    };
  } catch (cause) {
    console.error(
      "Could not read the channel settings for village %s",
      villageId,
      cause,
    );
    return null;
  }
}

/**
 * Writes one village's channel settings.
 *
 * The only place these four columns are set from the application. `id` is not a
 * value a coordinator types — `villageChannelFormSchema` derives it from `url`
 * before this is called — so the two cannot drift apart into a village whose
 * residents follow one channel while its alerts are posted to another.
 *
 * It takes a `villageId` and never reads one — the caller resolves it from the
 * session profile (domain rule 4), because a village id in a form post is a way
 * to configure somebody else's channel.
 *
 * Unlike everything else in this module it **does** throw on a database error:
 * a save that silently failed would leave the coordinator looking at the values
 * they typed and believing them. The call site turns it into a message.
 */
export async function saveVillageChannel(
  villageId: string,
  settings: {
    url: string | null;
    id: string | null;
    enabled: boolean;
    minSeverity: Severity;
  },
): Promise<void> {
  await prisma.village.update({
    where: { id: villageId },
    data: {
      whatsappChannelUrl: settings.url,
      whatsappChannelId: settings.id,
      whatsappEnabled: settings.enabled,
      whatsappMinSeverity: settings.minSeverity,
    },
  });
}

/**
 * Only lets an `https:` URL through to an `href`.
 *
 * The dashboard form validates this on the way in, but the check stays: the
 * four columns predate that screen and were set by hand in the database for as
 * long as they have existed, so nothing guarantees a stored value has ever met
 * a validator. A `javascript:` URL rendered into an anchor on `/settings` is
 * stored XSS against every resident of the village, and the check costs one
 * `URL` parse. Any origin is accepted: WhatsApp has used both `whatsapp.com`
 * and `chat.whatsapp.com` for invite links and pinning one would break the day
 * they add a third.
 */
function safeChannelUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// The alerts themselves
// ---------------------------------------------------------------------------

/**
 * Writes one alert to the server log, addressed to the village's channel.
 *
 * All that is left of the transport, and it does not pretend otherwise. There is
 * no relay to POST to (see the header), so the alert reaches the channel when a
 * coordinator copies it from `/dashboard` or the incident page and pastes it —
 * and this line is what makes "did that alert get as far as somebody's
 * clipboard?" answerable in a Vercel log without going back to the database.
 *
 * The text is the one `formatIncidentAlert` produced, flattened onto a single
 * log line. Newlines become `·` so a multi-line alert does not arrive in the log
 * as five entries with no relationship to each other.
 */
function logAlert(channelId: string, text: string): ChannelAlertResult {
  console.log(
    "[whatsapp:alert] channel %s ← %s",
    channelId,
    text.replace(/\n+/g, " · "),
  );

  return { logged: true };
}

/**
 * The village's freshly published incident, as a channel alert.
 *
 * Called from `notifyIncidentPublished`, so it runs on publish and never on
 * file — a report in the queue has not cleared moderation and must not reach
 * residents (domain rule 6), let alone the public.
 *
 * The three refusals are the village's own settings and are unchanged from when
 * this posted for real: off unless the village turned it on, nothing without a
 * channel to name, and nothing below the village's severity floor. They still
 * matter with no relay behind them — the log line is what a coordinator reads
 * back, and one written for a village that has posting switched off would
 * describe an alert nobody agreed to send.
 */
export async function logIncidentAlert(
  incident: AlertIncident & { villageId: string },
): Promise<ChannelAlertResult> {
  const channel = await getVillageChannel(incident.villageId);

  if (!channel?.enabled) return { logged: false, skipped: "village_disabled" };
  if (!channel.id) return { logged: false, skipped: "no_channel" };

  const meta = SEVERITY_META[incident.severity];

  if (meta.weight < SEVERITY_META[channel.minSeverity].weight) {
    return { logged: false, skipped: "below_threshold" };
  }

  return logAlert(channel.id, formatIncidentAlert(incident));
}

/**
 * The weekly digest, as a channel alert.
 *
 * **Not severity-gated**, unlike an incident. `whatsappMinSeverity` asks "is
 * this one thing worth telling the public about?", and a week in review is a
 * different question — it is the roundup a village would put in the parish
 * newsletter, and a quiet week is itself worth saying out loud. It still
 * respects `whatsappEnabled`, which is the switch that decides whether this
 * village talks to the public at all.
 */
export async function logDigestAlert(input: {
  villageId: string;
  title: string;
  summary: string;
}): Promise<ChannelAlertResult> {
  const channel = await getVillageChannel(input.villageId);

  if (!channel?.enabled) return { logged: false, skipped: "village_disabled" };
  if (!channel.id) return { logged: false, skipped: "no_channel" };

  return logAlert(
    channel.id,
    [`📋 ${input.title}`, "", input.summary, "", `The full week: ${appBaseUrl()}/map`].join(
      "\n",
    ),
  );
}
