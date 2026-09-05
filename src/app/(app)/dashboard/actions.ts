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
  getResidentEmail,
  getVillageMode,
  getVillageParishCouncil,
  getVillagePrivacyLevel,
  setResidentRole,
  setVillageParishCouncil,
  setVillagePrivacyLevel,
} from "@/lib/villages";
import { PRIVACY_LEVEL_META } from "@/lib/constants";
import {
  fieldErrors,
  incidentModerationSchema,
  villageAutoApproveFormSchema,
  villageChannelFormSchema,
  villageEcopsSiteFormSchema,
  villageParishCouncilFormSchema,
  villagePrivacyLevelFormSchema,
  villageResidentRoleFormSchema,
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
  const session = await requireCoordinator("/dashboard/queue");
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
  // The queue loses the card, and the Overview tab's "waiting for review"
  // and "published" cards both move.
  revalidatePath("/dashboard/queue");
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
  const session = await requireCoordinator("/dashboard/settings");
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

  // The switch itself, and the notice the queue renders in place of a queue.
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/queue");

  return {
    ok: true,
    message: autoApprove
      ? "Auto-approve is on. New reports go live the moment they are filed."
      : "Auto-approve is off. New reports wait for a coordinator.",
  };
}

export type ParishCouncilState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Names whoever is answerable for the village's data.
 *
 * In a `council` village that is the parish, town or community council; in a
 * `community` village — the default, and most villages — it is the coordinator
 * or their group, and there is no council to name. The column is
 * `Village.parishCouncil` either way; what moves with `Village.mode` is every
 * word on screen about it, the labels in `ParishCouncilForm`, the messages
 * returned from here and the label the audit trail files it under.
 *
 * `requireCoordinator()` and the village from the session profile, for the same
 * reason the other two settings here use them: this is a coordinator describing
 * their own village, and a `villageId` in the payload would be a way to rename
 * the data controller on somebody else's (domain rule 4).
 *
 * ## What this column actually does
 *
 * `Village.parishCouncil` is the name in the footer of every document `/reports`
 * produces — the period report a coordinator sends to a PCSO, and the
 * single-incident summary that goes out through the share sheet. Until now the
 * only way to set it was `saveVillageAdminSettings`, which is platform-admin
 * only, so a village whose coordinator knew the answer had to ask somebody who
 * did not. Empty, `reportController` falls back to `DATA_CONTROLLER` in
 * `constants.ts` — which names the operator, not this village's controller — and
 * `/reports` renders an amber warning about it. This is the field that clears
 * that warning.
 *
 * **Audited**, and toned `sensitive` alongside the other two village settings.
 * Not because it widens an audience but because it is a statement of legal
 * accountability leaving the village on paper: a resident reading "data
 * controller: X" on a report is being told who to complain to.
 *
 * The audit write is allowed to fail silently and the save is not, which is the
 * ordering every settings action here uses — the column is already written by
 * the time the row is attempted, and telling a coordinator their save failed
 * when it succeeded would be false.
 */
export async function saveParishCouncilAction(
  _previous: ParishCouncilState,
  formData: FormData,
): Promise<ParishCouncilState> {
  const session = await requireCoordinator("/dashboard/settings");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return { ok: false, message: "You are not attached to a village." };
  }

  const parsed = villageParishCouncilFormSchema.safeParse({
    parishCouncil: formData.get("parishCouncil") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted field.",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  const { parishCouncil } = parsed.data;

  /*
    Read before the write, so the trail records what actually changed rather
    than what was submitted — and the mode alongside it, because every message
    this action can return names either a council or a data controller, and
    most villages have neither a council nor a reason to be told about one.
    `ParishCouncilForm` already picks its labels the same way; a toast that
    said "council name cleared" under a field headed "Data controller" is the
    seam this closes.
  */
  const [before, mode] = await Promise.all([
    getVillageParishCouncil(villageId),
    getVillageMode(villageId),
  ]);

  const council = mode === "council";

  const written = await setVillageParishCouncil(villageId, parishCouncil);

  if (!written.ok) {
    return {
      ok: false,
      // Two failures, two messages. "Try again" is a lie when the column does
      // not exist: the coordinator can press Save all afternoon and it will
      // never work, so the message names the fix and whose job it is.
      message:
        written.reason === "unmigrated"
          ? "This village's database has not been updated for this setting yet. Ask an administrator to apply the pending migration."
          : council
            ? "Could not save the council name. Try again."
            : "Could not save the name. Try again.",
    };
  }

  try {
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorEmail: session.user.email ?? null,
        actorRole: session.profile?.role ?? null,
        villageId,
        action: "village.parish_council_changed",
        entityType: "village",
        entityId: villageId,
        // The name of a public body, printed on documents this village already
        // sends outside it — nothing here is personal data, and every
        // coordinator can read both values on the screen this posts from.
        before: { parishCouncil: before.value },
        after: { parishCouncil },
      },
    });
  } catch (cause) {
    console.error(
      "Could not audit the parish council change for %s",
      villageId,
      cause,
    );
  }

  // `/reports` prints it in both documents' footers and warns while it is
  // unset; `/incidents/[id]` takes the same read for a coordinator's share
  // panel on a published report.
  revalidatePath("/dashboard/settings");
  revalidatePath("/reports");

  return {
    ok: true,
    message: parishCouncil
      ? `Reports will name ${parishCouncil} as the data controller.`
      : council
        ? "Council name cleared. Reports fall back to the deployment-wide controller."
        : "Name cleared. Reports fall back to the deployment-wide contact, which operates the software rather than controlling your village's data.",
  };
}

export type PrivacyLevelState = {
  ok: boolean;
  message: string;
};

/**
 * Sets how faces are covered in media uploaded to this village.
 *
 * `requireCoordinator()` and the village from the session profile, same as the
 * other three settings on this screen: a `villageId` in this payload would be a
 * way to turn a neighbouring parish's redaction down (domain rule 4).
 *
 * ## What this can and cannot do
 *
 * It picks a `FaceRedactionMode` and a Gaussian radius out of `PRIVACY_LEVELS`,
 * and that is the whole reach of it. The mosaic every `blur` level runs first is
 * fixed at `MOSAIC_CELLS` in `src/lib/media/face-blur.ts` and is deliberately
 * not on this scale — so a coordinator choosing the lightest level is choosing
 * how much of the scene around a face survives, not whether the face does.
 * There is no value here, and no way to post one, that uploads an unredacted
 * original: domain rule 3 is structural, and `POST /api/incidents/media` still
 * has no server-side fallback.
 *
 * **Audited and toned `sensitive`**, alongside the other three village
 * settings. The reason is its own: this is the only setting whose subject is
 * neither the reporter nor the coordinator but whoever happened to be in shot,
 * and moving down the scale changes what is left of them in every file
 * published afterwards.
 */
export async function savePrivacyLevelAction(
  _previous: PrivacyLevelState,
  formData: FormData,
): Promise<PrivacyLevelState> {
  const session = await requireCoordinator("/dashboard/settings");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return { ok: false, message: "You are not attached to a village." };
  }

  const parsed = villagePrivacyLevelFormSchema.safeParse({
    privacyLevel: formData.get("privacyLevel"),
  });

  if (!parsed.success) {
    return { ok: false, message: "That privacy level is not valid." };
  }

  const { privacyLevel } = parsed.data;
  // Read before the write, so the trail records what actually changed rather
  // than what was submitted.
  const before = await getVillagePrivacyLevel(villageId);

  const written = await setVillagePrivacyLevel(villageId, privacyLevel);

  if (!written.ok) {
    return {
      ok: false,
      // Two failures, two messages — "try again" is a lie when the column does
      // not exist. Same reasoning as the parish council field above.
      message:
        written.reason === "unmigrated"
          ? "This village's database has not been updated for this setting yet. Ask an administrator to apply the pending migration."
          : "Could not save the privacy level. Try again.",
    };
  }

  try {
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorEmail: session.user.email ?? null,
        actorRole: session.profile?.role ?? null,
        villageId,
        action: "village.privacy_level_changed",
        entityType: "village",
        entityId: villageId,
        before: { privacyLevel: before.value },
        after: { privacyLevel },
      },
    });
  } catch (cause) {
    // The setting is saved either way. A trail write that failed is worth a log
    // and not worth telling the coordinator their save did not happen.
    console.error(
      "Could not audit the privacy level change for %s",
      villageId,
      cause,
    );
  }

  // The wizard reads the column server-side on every render of
  // `/incidents/new`, so the next reporter to open it gets the new level.
  revalidatePath("/dashboard/settings");
  revalidatePath("/incidents/new");

  return {
    ok: true,
    message: `Faces will be covered with ${PRIVACY_LEVEL_META[privacyLevel].label.toLowerCase()} from now on. Media already uploaded keeps the level it was processed with.`,
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
  const session = await requireCoordinator("/dashboard/settings");
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
  // The form, the resident-facing follow link, and the "Open WhatsApp"
  // button on a report the coordinator has just approved.
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/queue");
  revalidatePath("/settings");

  return {
    ok: true,
    message: values.whatsappEnabled
      ? "Channel saved. Published alerts at or above your threshold will be posted."
      : "Channel saved. Posting is off — residents can still follow the link.",
  };
}

export type ResidentRoleState = {
  ok: boolean;
  message: string;
};

/**
 * A coordinator confirming that somebody actually lives in the village, or
 * withdrawing that confirmation.
 *
 * The rules are all in `setResidentRole` rather than here, because this is the
 * third place in the codebase that writes `User.role` and the first that is not
 * platform-admin only. What that function refuses — anybody holding coordinator
 * access, the caller themselves, a resident of another village, a closed
 * account, and any role outside `RESIDENT_MANAGED_ROLES` — is the entire
 * argument for the control existing, and rules that live at a call site are
 * rules the next call site does not have.
 *
 * The form posts an intent rather than a role (domain rule 5). There is no
 * shape of request this accepts that can ask for `COORDINATOR`: raising
 * somebody into that role is still `appointCoordinator` or an approved
 * application, both platform-admin only.
 */
export async function saveResidentRoleAction(
  _previous: ResidentRoleState,
  formData: FormData,
): Promise<ResidentRoleState> {
  const session = await requireCoordinator("/dashboard/settings");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return { ok: false, message: "You are not attached to a village." };
  }

  const parsed = villageResidentRoleFormSchema.safeParse({
    residentId: formData.get("residentId"),
    // Posted by the button that was pressed, so it is always present — the
    // union handles the absent case the way the other village forms do.
    verified: formData.get("verified") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, message: "That resident could not be found." };
  }

  const result = await setResidentRole({
    session,
    villageId,
    residentId: parsed.data.residentId,
    verified: parsed.data.verified,
  });

  if (!result.ok) return { ok: false, message: result.error };

  revalidatePath("/dashboard/settings");

  return { ok: true, message: result.message };
}

/**
 * Reveals one resident's full email address to the coordinator asking for it.
 *
 * The resident list carries `j***@gmail.com` and nothing more, so this is the
 * only path an address takes to a browser. See `getResidentEmail` for what the
 * pair does and does not buy, and for why — unlike
 * `revealRawDescriptionAction`, which this is otherwise shaped like — it writes
 * no audit row.
 *
 * `requireCoordinator()` is re-established from the server, because a server
 * action is a POST endpoint with a generated URL and "the button is only on a
 * coordinator page" has never been an authorisation check. The village comes
 * from the session profile and never the form (domain rule 4).
 */
export async function revealResidentEmailAction(
  _previous: { email: string | null; error: string | null },
  formData: FormData,
): Promise<{ email: string | null; error: string | null }> {
  const session = await requireCoordinator("/dashboard/settings");
  const villageId = session.profile?.villageId;

  const residentId = formData.get("residentId");

  if (!villageId || typeof residentId !== "string") {
    return { email: null, error: "That address could not be read." };
  }

  const result = await getResidentEmail({ session, villageId, residentId });

  return result.ok
    ? { email: result.email, error: null }
    : { email: null, error: result.error };
}


// ---------------------------------------------------------------------------
// The police alert feed
// ---------------------------------------------------------------------------

export type EcopsSiteState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Points the village's police-alert panel at a Neighbourhood Alert site.
 *
 * The fifth village setting, and the only one whose subject is a third party.
 * The other four decide how this village's own reports are handled; this one
 * decides **whose bulletins appear on the dashboard under a police badge**.
 *
 * That is why it is audited and toned `sensitive` alongside them. The failure
 * mode is not an empty panel — an unrecognised number gives that, harmlessly —
 * it is a *plausible* one: another force's warnings, correctly attributed to a
 * real force, shown to a village as though they were about it. Nothing else in
 * the app puts somebody else's words on a screen under somebody else's
 * authority.
 *
 * **Nothing here can verify the number, and the copy on the form says so.** The
 * feed answers an unknown `SiteId` with a well-formed empty channel rather than
 * an error, so there is no check to make: whether it is a real portal is
 * settled by the first sync, and `EcopsSiteSync` is what carries that answer
 * back to the screen.
 */
export async function saveEcopsSiteAction(
  _previous: EcopsSiteState,
  formData: FormData,
): Promise<EcopsSiteState> {
  const session = await requireCoordinator("/dashboard/settings");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return { ok: false, message: "You are not attached to a village." };
  }

  const parsed = villageEcopsSiteFormSchema.safeParse({
    ecopsSiteId: formData.get("ecopsSiteId") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted field.",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  const { ecopsSiteId } = parsed.data;

  // Read before the write, so the trail records what actually changed rather
  // than what was submitted — `saveParishCouncilAction`'s reasoning.
  let before: number | null = null;

  try {
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: { ecopsSiteId: true },
    });

    before = village?.ecopsSiteId ?? null;

    await prisma.village.update({
      where: { id: villageId },
      data: { ecopsSiteId },
    });
  } catch (error) {
    console.error("[dashboard] could not save the eCops site", error);

    /*
      The column arrives with `20260905140000_ecops_alerts`, which a database
      can be behind on. "Try again" would be a lie in that case — the
      coordinator can press Save all afternoon — so the message names the fix
      and whose job it is, the way `setVillageParishCouncil` does.
    */
    const code = (error as { code?: unknown } | null)?.code;
    const unmigrated = code === "P2022" || code === "42703";

    return {
      ok: false,
      message: unmigrated
        ? "This village's database has not been updated for police alerts yet. Ask an administrator to apply the pending migration."
        : "Could not save the site number. Try again.",
    };
  }

  if (before !== ecopsSiteId) {
    try {
      await prisma.auditLog.create({
        data: {
          actorId: session.user.id,
          actorEmail: session.user.email ?? null,
          actorRole: session.profile?.role ?? null,
          villageId,
          action: "village.ecops_site_changed",
          entityType: "village",
          entityId: villageId,
          // Two site numbers and nothing else. Neither is personal data, and
          // both are what somebody asking "why is this village showing
          // Warwickshire's alerts" needs to answer the question.
          before: { ecopsSiteId: before },
          after: { ecopsSiteId },
        },
      });
    } catch (error) {
      // The setting is saved. An audit write that fails after the act is
      // swallowed everywhere in this file, because telling somebody their
      // change failed when it succeeded would be false.
      console.error("[dashboard] could not audit the eCops site change", error);
    }
  }

  // Settings holds the form; Overview holds the panel it feeds.
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");

  return {
    ok: true,
    message:
      ecopsSiteId === null
        ? "Police alerts turned off for this village."
        : `Police alerts will come from site ${ecopsSiteId}. The next scheduled fetch will fill the panel.`,
  };
}
