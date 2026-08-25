"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { auditContext } from "@/lib/audit-context";
import { prisma } from "@/lib/prisma";
import { applyModeration } from "@/lib/moderation";
import { removeIncident } from "@/lib/erasure";
import { isCoordinatorRole } from "@/lib/constants";
import {
  fieldErrors,
  incidentEditSchema,
  incidentModerationSchema,
} from "@/lib/validations";

/**
 * The actions available from an incident's own page.
 *
 * Two different callers with two different rights, and the split is enforced
 * here rather than by which buttons the page happened to render:
 *
 * - **The reporter** may edit their own report while it is still in the queue,
 *   and may erase it right up to the point a coordinator closes it — see
 *   `deleteIncidentAction`, which is the right to erasure rather than an edit
 *   and is therefore not bounded by the edit window.
 * - **A coordinator** may edit any report still in their own village's queue,
 *   which is how the Edit button on `/dashboard/queue` works. The window is the
 *   same one the reporter has — a published report cannot be rewritten by
 *   anybody.
 * - **A coordinator** may publish, reject or archive anything in their village,
 *   through the same `applyModeration` path the dashboard uses — so the audit
 *   row and the village alert cannot be skipped by coming in from here.
 */

export type IncidentActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

/**
 * Statuses a report may still be edited or withdrawn from.
 *
 * The name is the reporter's because they are the caller it was written for,
 * and it still bounds them; a coordinator editing from the review queue is held
 * to exactly the same window, which is the point — the constraint that matters
 * is that a *published* report is not rewritable, not who is doing the writing.
 */
const REPORTER_EDITABLE = ["DRAFT", "PENDING_REVIEW"] as const;

export async function moderateFromDetailAction(
  _previous: IncidentActionState,
  formData: FormData,
): Promise<IncidentActionState> {
  const session = await requireSession("/incidents");
  const villageId = session.profile?.villageId;
  const role = session.profile?.role;

  if (!villageId || !isCoordinatorRole(role)) {
    return { ok: false, message: "Only village coordinators can do that." };
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

  revalidatePath(`/incidents/${parsed.data.incidentId}`);
  revalidatePath("/incidents");
  revalidatePath("/dashboard");
  revalidatePath("/map");

  return {
    ok: true,
    message:
      parsed.data.action === "PUBLISH" && result.notified > 0
        ? `${result.reference} published — ${result.notified} neighbour${result.notified === 1 ? "" : "s"} alerted.`
        : `${result.reference} is now ${result.status.toLowerCase()}.`,
  };
}

/**
 * The reporter's own edit.
 *
 * Writes `description` — the public column — and leaves `rawDescription`
 * untouched. The reporter's original words are the record of what was actually
 * submitted; a coordinator comparing the two is how an edit gets reviewed, and
 * overwriting the original would remove the thing being compared against.
 */
export async function editIncidentAction(
  _previous: IncidentActionState,
  formData: FormData,
): Promise<IncidentActionState> {
  const session = await requireSession("/incidents");
  const villageId = session.profile?.villageId;
  const incidentId = formData.get("incidentId");

  if (!villageId || typeof incidentId !== "string") {
    return { ok: false, message: "That report could not be found." };
  }

  const parsed = incidentEditSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    type: formData.get("type"),
    severity: formData.get("severity"),
    locationText: formData.get("locationText") || undefined,
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  /*
    Ownership and status in the predicate rather than in a prior read: this is
    what stops a reporter editing someone else's report, or their own after a
    coordinator has published it.

    A coordinator drops the ownership clause and keeps everything else — the
    village (domain rule 4) and the queue statuses. That is the whole of the
    widening the dashboard redesign made, and it is written as a missing clause
    rather than an `OR` so the reporter's own path is byte-for-byte what it was.

    The role comes off the revalidated session profile, never the payload: a
    server action is a POST endpoint with a generated URL, so "the button is
    only on a coordinator page" has never been an authorisation check.
  */
  const coordinator = isCoordinatorRole(session.profile?.role);

  const { count } = await prisma.incident.updateMany({
    where: {
      id: incidentId,
      villageId,
      ...(coordinator ? {} : { reporterId: session.user.id }),
      status: { in: [...REPORTER_EDITABLE] },
    },
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      severity: parsed.data.severity,
      locationText: parsed.data.locationText ?? null,
    },
  });

  if (count === 0) {
    return {
      ok: false,
      message: "This report can no longer be edited — it has been reviewed.",
    };
  }

  // `/privacy` §2 names editing in the list of privileged actions recorded
  // "including who did it, when, and from what IP address and browser". A server
  // action has no `request` to read those off, which is why they were absent
  // here and why `auditContext()` exists.
  const context = await auditContext();

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: session.profile?.role,
      villageId,
      action: "incident.edit",
      entityType: "Incident",
      entityId: incidentId,
      after: {
        title: parsed.data.title,
        type: parsed.data.type,
        severity: parsed.data.severity,
        /*
          Whether this was the reporter fixing their own wording or a
          coordinator correcting somebody else's. `actorRole` above already
          distinguishes the two — a coordinator can also be a reporter, and on
          their own report both are true — so this says which of the two hats
          was being worn rather than leaving the trail to infer it.
        */
        byCoordinator: coordinator,
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });

  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/incidents");
  // The queue renders the title, the description and the landmark, all four of
  // which this may have just changed.
  revalidatePath("/dashboard/queue");

  redirect(`/incidents/${incidentId}`);
}

/**
 * The reporter erasing their own report — UK GDPR Article 17.
 *
 * This used to be "Withdraw": a hard delete, and only from the queue statuses.
 * Both halves changed, and in opposite directions:
 *
 * - **Wider.** Every status can be erased now (`canReporterErase`), published
 *   and rejected included.
 *   "Once published it belongs to the village" is a reasonable product
 *   instinct and not a lawful basis to refuse an erasure request.
 * - **Softer.** The row survives as `REMOVED` rather than being deleted, because
 *   `AuditLog.entityId` points at it and the trail is append-only (domain rule
 *   7). What is actually destroyed — the media in the bucket, the tags — is
 *   destroyed by `removeIncident`, which is the same code `DELETE
 *   /api/incidents/[id]` runs. Two entry points, one erasure.
 */
export async function deleteIncidentAction(
  _previous: IncidentActionState,
  formData: FormData,
): Promise<IncidentActionState> {
  const session = await requireSession("/incidents");
  const villageId = session.profile?.villageId;
  const incidentId = formData.get("incidentId");

  if (!villageId || typeof incidentId !== "string") {
    return { ok: false, message: "That report could not be found." };
  }

  const result = await removeIncident({ session, villageId, incidentId });

  if (!result.ok) return { ok: false, message: result.error };

  revalidatePath("/incidents");
  revalidatePath("/dashboard");
  revalidatePath("/map");

  // The toast travels in the query string because this never returns — see
  // `FlashToast`. The list page announces it and strips nothing else.
  redirect("/incidents?deleted=1");
}
