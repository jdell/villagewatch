"use server";

import { revalidatePath } from "next/cache";
import { requireCoordinator } from "@/lib/auth";
import {
  applyModeration,
  getVillageAutoApprove,
  readRawDescription,
  setVillageAutoApprove,
} from "@/lib/moderation";
import { prisma } from "@/lib/prisma";
import {
  getVillageChannelSettings,
  saveVillageChannel,
} from "@/lib/whatsapp-channel";
import {
  fieldErrors,
  incidentModerationSchema,
  villageAutoApproveFormSchema,
  villageChannelFormSchema,
} from "@/lib/validations";

/**
 * Server actions behind the moderation queue.
 *
 * Every one of these re-establishes the session and the role from the server.
 * A server action is a POST endpoint with a generated URL — it is reachable
 * without ever rendering the dashboard, so "the button is only on a coordinator
 * page" is not an authorisation check. `requireCoordinator()` is.
 *
 * The village likewise comes from the session profile and never from the form
 * (domain rule 4).
 */

export type ModerationState = {
  ok: boolean;
  message: string;
  /**
   * The published report as WhatsApp-ready text, on a successful PUBLISH only.
   *
   * Approving is the moment the coordinator has the report in front of them and
   * has just decided the village should hear about it — which is the moment to
   * hand them the text, because nothing posts it for them (see
   * `src/lib/whatsapp-channel.ts`). Built by `applyModeration` so the queue, the
   * incident page and the server log all carry the same words.
   */
  alert?: string;
  /** The reference the alert belongs to, for labelling it in the queue. */
  reference?: string;
};

export async function moderateIncidentAction(
  _previous: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  const session = await requireCoordinator("/dashboard");
  const villageId = session.profile?.villageId;

  if (!villageId) {
    return { ok: false, message: "You are not attached to a village." };
  }

  const parsed = incidentModerationSchema.safeParse({
    incidentId: formData.get("incidentId"),
    action: formData.get("action"),
    note: formData.get("note") || undefined,
  });

  if (!parsed.success) {
    return { ok: false, message: "That action is not valid." };
  }

  const result = await applyModeration({
    session,
    villageId,
    incidentId: parsed.data.incidentId,
    action: parsed.data.action,
    note: parsed.data.note,
  });

  if (!result.ok) return { ok: false, message: result.error };

  // The queue, the list and the map all change shape when a report is
  // published, and the detail page shows a different set of actions.
  revalidatePath("/dashboard");
  revalidatePath("/incidents");
  revalidatePath("/map");
  revalidatePath(`/incidents/${parsed.data.incidentId}`);

  if (parsed.data.action === "PUBLISH") {
    return {
      ok: true,
      message:
        result.notified > 0
          ? `${result.reference} published — ${result.notified} neighbour${result.notified === 1 ? "" : "s"} alerted.`
          : `${result.reference} is now on the village map.`,
      // Carried back to the screen because `revalidatePath` above takes the
      // report out of the queue: the card that submitted this is about to
      // unmount, and the text has to outlive it somewhere the coordinator can
      // still reach it. See `ModerationQueue`.
      alert: result.alert,
      reference: result.reference,
    };
  }

  return { ok: true, message: `${result.reference} was ${result.status.toLowerCase()}.` };
}

/**
 * Reveals one report's verbatim text to the coordinator reviewing it.
 *
 * Separate from rendering the queue on purpose. `rawDescription` may hold
 * names, plates and addresses, and every read of it owes an `AuditLog` row
 * (domain rule 1) — a page that logged an entry each time anyone glanced at the
 * queue would produce a trail nobody could read. Behind a button, one row means
 * one deliberate look.
 */
export async function revealRawDescriptionAction(
  _previous: { text: string | null; error: string | null },
  formData: FormData,
): Promise<{ text: string | null; error: string | null }> {
  const session = await requireCoordinator("/dashboard");
  const villageId = session.profile?.villageId;

  const incidentId = formData.get("incidentId");

  if (!villageId || typeof incidentId !== "string") {
    return { text: null, error: "That report could not be read." };
  }

  const result = await readRawDescription({ session, villageId, incidentId });

  return result.ok
    ? { text: result.text, error: null }
    : { text: null, error: result.error };
}

export type AutoApproveState = {
  ok: boolean;
  message: string;
};

/**
 * Turns coordinator review on or off for the whole village.
 *
 * `requireCoordinator()` rather than an admin gate, and the village comes from
 * the session profile: this is a coordinator deciding how their own village
 * works, and a `villageId` in the payload would be a way to switch off the
 * moderation on somebody else's (domain rule 4).
 *
 * **Audited, and the row is the point.** This is the second configuration
 * change in `AUDIT_ACTIONS` and the more consequential of the two: the WhatsApp
 * switch widens who can read a published report, and this one removes the
 * person who decides whether it is published. Every report filed afterwards
 * reaches the map on the reporter's own say-so, and the trail is the only place
 * that records who accepted that and when.
 *
 * Existing reports are deliberately left alone. Turning the setting on does not
 * flush the queue — those reports were filed under a promise of review, some of
 * them may be sitting there precisely because a coordinator had doubts, and
 * publishing them in a batch from a settings toggle is not a thing anybody
 * asked for. It applies to what is filed next.
 */
export async function saveAutoApproveAction(
  _previous: AutoApproveState,
  formData: FormData,
): Promise<AutoApproveState> {
  const session = await requireCoordinator("/dashboard");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return { ok: false, message: "You are not attached to a village." };
  }

  const parsed = villageAutoApproveFormSchema.safeParse({
    // An unchecked checkbox is absent from the payload entirely.
    autoApprove: formData.get("autoApprove") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, message: "That setting is not valid." };
  }

  const { autoApprove } = parsed.data;
  // Read before the write, so the trail records what actually changed rather
  // than what was submitted.
  const before = await getVillageAutoApprove(villageId);

  try {
    await setVillageAutoApprove(villageId, autoApprove);
  } catch (cause) {
    console.error(
      "Could not save the auto-approve setting for village %s",
      villageId,
      cause,
    );
    return { ok: false, message: "Could not save that setting. Try again." };
  }

  try {
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorEmail: session.user.email ?? null,
        actorRole: session.profile?.role ?? null,
        villageId,
        action: "village.auto_approve_changed",
        entityType: "village",
        entityId: villageId,
        before: { autoApprove: before },
        after: { autoApprove },
      },
    });
  } catch (cause) {
    // The setting is saved either way. A trail write that failed is worth a log
    // and not worth telling the coordinator their save did not happen.
    console.error("Could not audit the auto-approve change for %s", villageId, cause);
  }

  revalidatePath("/dashboard");

  return {
    ok: true,
    message: autoApprove
      ? "Auto-approve is on. New reports go live the moment they are filed."
      : "Auto-approve is off. New reports wait for a coordinator.",
  };
}

export type ChannelSettingsState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Saves the village's WhatsApp Channel settings.
 *
 * The village comes from the session profile and never from the form: a
 * `villageId` in this payload would be a way to point a neighbouring parish's
 * public channel at your own relay id (domain rule 4).
 *
 * **Audited, unlike the posts themselves.** A channel post is a deterministic
 * consequence of `incident.publish` plus this configuration, both already in the
 * trail — but *this* is the configuration, and it is the only setting in the app
 * that widens who can read the village's alerts beyond the village. Who turned
 * it on, and when, is the question the trail exists to answer.
 *
 * `before` and `after` carry the id, because that is what a coordinator would
 * need to see to work out that alerts went somewhere unexpected. Neither is a
 * personal-data column, and every coordinator in the village can already read
 * both on the screen this posts from.
 */
export async function saveChannelSettingsAction(
  _previous: ChannelSettingsState,
  formData: FormData,
): Promise<ChannelSettingsState> {
  const session = await requireCoordinator("/dashboard");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return { ok: false, message: "You are not attached to a village." };
  }

  // No `whatsappChannelId` here on purpose — the schema derives it from the
  // invite link. A posted one would be a way to send the village's public
  // alerts somewhere other than the channel residents are following.
  const parsed = villageChannelFormSchema.safeParse({
    whatsappChannelUrl: formData.get("whatsappChannelUrl") ?? "",
    // An unchecked checkbox is absent from the payload entirely.
    whatsappEnabled: formData.get("whatsappEnabled") ?? "",
    whatsappMinSeverity: formData.get("whatsappMinSeverity"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  const values = parsed.data;
  // Read before the write, so the trail records what actually changed rather
  // than what was submitted.
  const before = await getVillageChannelSettings(villageId);

  try {
    await saveVillageChannel(villageId, {
      url: values.whatsappChannelUrl,
      id: values.whatsappChannelId,
      enabled: values.whatsappEnabled,
      minSeverity: values.whatsappMinSeverity,
    });
  } catch (cause) {
    console.error(
      "Could not save the channel settings for village %s",
      villageId,
      cause,
    );
    return { ok: false, message: "Could not save the channel. Try again." };
  }

  try {
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorEmail: session.user.email ?? null,
        actorRole: session.profile?.role ?? null,
        villageId,
        action: "village.channel_update",
        entityType: "village",
        entityId: villageId,
        before: before
          ? { enabled: before.enabled, channelId: before.id, minSeverity: before.minSeverity }
          : undefined,
        after: {
          enabled: values.whatsappEnabled,
          channelId: values.whatsappChannelId,
          minSeverity: values.whatsappMinSeverity,
        },
      },
    });
  } catch (cause) {
    // The setting is saved either way. A trail write that failed is worth a log
    // and not worth telling the coordinator their save did not happen.
    console.error("Could not audit the channel change for %s", villageId, cause);
  }

  // `/settings` renders the follow link from these columns for every resident
  // of the village, and the dashboard renders the form itself.
  revalidatePath("/dashboard");
  revalidatePath("/settings");

  return {
    ok: true,
    message: values.whatsappEnabled
      ? "Channel saved. Published alerts at or above your threshold will be posted."
      : "Channel saved. Posting is off — residents can still follow the link.",
  };
}
