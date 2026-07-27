import type { Severity } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { formatTimeAgo } from "@/lib/format";
import { extractChannelCode } from "@/lib/validations";
import {
  SEVERITY_META,
  WHATSAPP_POST_MAX_CHARS,
  WHATSAPP_RELAY_TIMEOUT_MS,
} from "@/lib/constants";

/**
 * Mirrors published alerts to a village's WhatsApp Channel. **Server only** —
 * `WHATSAPP_CHANNEL_API_TOKEN` has no `NEXT_PUBLIC_` prefix and this module
 * reads a village's channel credentials.
 *
 * ## There is no official API for this
 *
 * Read this before wiring a provider in. Meta's WhatsApp Cloud API sends
 * messages to phone numbers; it has **no endpoint that posts to a Channel**.
 * Channels are a broadcast surface Meta expects a human to post to from the
 * app, and as of this writing there is no sanctioned programmatic path.
 *
 * Third-party relays (Whapi and similar) do offer channel posting, by driving
 * the WhatsApp Web protocol. They work. They are also, explicitly, not a Meta
 * feature: automating that protocol can breach WhatsApp's terms and the number
 * behind it can be banned. That is a decision for whoever runs the deployment,
 * not one to be baked into a client library here — so this module is a
 * provider-agnostic HTTP POST to whatever endpoint `WHATSAPP_CHANNEL_API_URL`
 * names, and takes no view on who is on the other end.
 *
 * **The follow link needs none of this.** `Village.whatsappChannelUrl` is a
 * public invite link a coordinator pastes in on `/dashboard`; `/settings`
 * renders it and residents follow the channel in the app. That half is
 * officially supported, works with zero configuration, and is what a village
 * gets if it never sets up a relay at all. Posting is the optional half.
 *
 * ## The channel is the village's, the relay account is the platform's
 *
 * Both halves of a channel's identity — the public invite link and the code a
 * relay posts to — live on the `Village` row, and a coordinator now supplies
 * only the first: the code is the last segment of the link, so the dashboard
 * asks for the link alone and `extractChannelCode` derives the rest. Nothing
 * about *which* channel is an environment variable, because a deployment serves
 * many villages and each one runs its own.
 *
 * What is platform-level is the relay itself: `WHATSAPP_CHANNEL_API_URL` and
 * `WHATSAPP_CHANNEL_API_TOKEN` are one account with one endpoint, shared by
 * every village that has switched posting on. A coordinator never sees them and
 * cannot set them.
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
 * - **`ChannelIncident` has no field that could carry `rawDescription`, `lat`
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
 * Same contract as `src/lib/notifications.ts`. A missing relay, a timeout and a
 * 500 from the provider are ordinary states. Publishing a report must never
 * fail because a WhatsApp post did — the incident is on the map and the push
 * has gone out either way.
 *
 * No `Notification` rows are written. That table is one row per user per
 * delivery and a channel post has no recipient list — nobody knows who follows
 * a channel, which is rather the point of one.
 *
 * No `AuditLog` row either. The post is a deterministic consequence of
 * `incident.publish` plus the village's own configuration, both of which are
 * already in the trail; a second row per post would say nothing the first does
 * not and would bury the human actions around it.
 */

const RELAY_URL = process.env.WHATSAPP_CHANNEL_API_URL ?? "";
const RELAY_TOKEN = process.env.WHATSAPP_CHANNEL_API_TOKEN ?? "";

/** Whether a relay is wired up. Without one the follow link still works. */
export const isWhatsAppRelayConfigured =
  RELAY_URL.length > 0 && RELAY_TOKEN.length > 0;

export type ChannelPostResult = {
  posted: boolean;
  /** Why nothing was posted, when nothing was. */
  skipped?:
    | "not_configured"
    | "village_disabled"
    | "no_channel"
    | "below_threshold"
    | "failed";
};

/**
 * A village's channel configuration.
 *
 * `url` is public and safe to render. `id` is the code a relay writes to. It is
 * the last segment of `url` and no longer a secret in any meaningful sense —
 * anyone holding the invite link holds it too — but it stays server-side out of
 * habit rather than need: no screen has a reason to show it except the dashboard
 * form, which derives its own preview from the link.
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
// The transport
// ---------------------------------------------------------------------------

/**
 * One POST to the configured relay. The only place in this module that touches
 * the network, and the only place that can fail.
 *
 * The body is deliberately minimal — `{ channelId, text }`. Relay providers
 * disagree on everything else, and a request shaped around one vendor's
 * envelope is a request that has to be rewritten to change vendor. If a
 * provider needs a different shape, adapt it here and leave every call site
 * alone.
 */
async function post(
  channelId: string,
  text: string,
): Promise<ChannelPostResult> {
  if (!isWhatsAppRelayConfigured) {
    // The branch a deployment with no relay takes — which, given there is no
    // official API, is expected to be most of them. Logged rather than silent,
    // so "did that go to the channel?" is answerable in a Vercel log.
    console.log(
      "[whatsapp:not-configured] channel %s ← %s",
      channelId,
      text.replace(/\n+/g, " · "),
    );

    return { posted: false, skipped: "not_configured" };
  }

  try {
    const response = await fetch(RELAY_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${RELAY_TOKEN}`,
      },
      body: JSON.stringify({ channelId, text }),
      // A relay that has stopped answering must not hold a moderation action
      // open. `applyModeration` is awaiting this inside a coordinator's click.
      signal: AbortSignal.timeout(WHATSAPP_RELAY_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(
        "WhatsApp relay refused a post to channel %s: %d %s",
        channelId,
        response.status,
        response.statusText,
      );

      return { posted: false, skipped: "failed" };
    }

    return { posted: true };
  } catch (cause) {
    // Timeouts, DNS, TLS, and a relay that went away mid-request.
    console.error("WhatsApp relay post to channel %s failed", channelId, cause);

    return { posted: false, skipped: "failed" };
  }
}

/** Absolute link back into the app, so a follower can read the full report. */
function absoluteUrl(path: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return new URL(path, base).toString();
}

/**
 * Trims a post to something a phone will render without a "read more" fold,
 * on a whole word.
 */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;

  const cut = value.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");

  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

// ---------------------------------------------------------------------------
// The posts themselves
// ---------------------------------------------------------------------------

/**
 * What may be said about an incident on a public channel.
 *
 * Note what is absent: `rawDescription`, `lat`, `lng`, the reporter, and the
 * anonymised `description` itself. The first three are the leak; the last is a
 * judgement call — a full description on a public feed is a great deal more
 * detail than a headline, and anyone entitled to it can open the link and sign
 * in. The post is a pointer, not a copy.
 */
export type ChannelIncident = {
  id: string;
  villageId: string;
  title: string;
  severity: Severity;
  locationText: string | null;
  occurredAt: Date;
};

/**
 * Mirrors a freshly published incident to the village's channel.
 *
 * Called from `notifyIncidentPublished`, so it runs on publish and never on
 * file — a report in the queue has not cleared moderation and must not reach
 * residents (domain rule 6), let alone the public.
 */
export async function postIncidentToChannel(
  incident: ChannelIncident,
): Promise<ChannelPostResult> {
  const channel = await getVillageChannel(incident.villageId);

  if (!channel?.enabled) return { posted: false, skipped: "village_disabled" };
  if (!channel.id) return { posted: false, skipped: "no_channel" };

  const meta = SEVERITY_META[incident.severity];

  if (meta.weight < SEVERITY_META[channel.minSeverity].weight) {
    return { posted: false, skipped: "below_threshold" };
  }

  const lines = [
    `${meta.emoji} *${meta.label} alert* — ${incident.title}`,
    "",
    incident.locationText
      ? `📍 ${incident.locationText} · ${formatTimeAgo(incident.occurredAt)}`
      : `🕒 ${formatTimeAgo(incident.occurredAt)}`,
    "",
    `Full report: ${absoluteUrl(`/incidents/${incident.id}`)}`,
  ];

  return post(channel.id, truncate(lines.join("\n"), WHATSAPP_POST_MAX_CHARS));
}

/**
 * Posts the weekly digest to the village's channel.
 *
 * **Not severity-gated**, unlike an incident. `whatsappMinSeverity` asks "is
 * this one thing worth telling the public about?", and a week in review is a
 * different question — it is the roundup a village would put in the parish
 * newsletter, and a quiet week is itself worth saying out loud. It still
 * respects `whatsappEnabled`, which is the switch that decides whether this
 * village talks to the public at all.
 */
export async function postDigestToChannel(input: {
  villageId: string;
  title: string;
  summary: string;
}): Promise<ChannelPostResult> {
  const channel = await getVillageChannel(input.villageId);

  if (!channel?.enabled) return { posted: false, skipped: "village_disabled" };
  if (!channel.id) return { posted: false, skipped: "no_channel" };

  const lines = [
    `📋 *${input.title}*`,
    "",
    input.summary,
    "",
    `The full week: ${absoluteUrl("/map")}`,
  ];

  return post(channel.id, truncate(lines.join("\n"), WHATSAPP_POST_MAX_CHARS));
}
