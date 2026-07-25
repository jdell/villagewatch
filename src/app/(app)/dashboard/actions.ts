"use server";

import { revalidatePath } from "next/cache";
import { requireCoordinator } from "@/lib/auth";
import { applyModeration, readRawDescription } from "@/lib/moderation";
import { incidentModerationSchema } from "@/lib/validations";

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
