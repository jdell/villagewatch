"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { applyModeration } from "@/lib/moderation";
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
 * - **The reporter** may edit or delete their own report while it is still in
 *   the queue. Once published it belongs to the village, and withdrawing it is
 *   a coordinator's call.
 * - **A coordinator** may publish, reject or archive anything in their village,
 *   through the same `applyModeration` path the dashboard uses — so the audit
 *   row and the village alert cannot be skipped by coming in from here.
 */

export type IncidentActionState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

/** Statuses a reporter may still change or withdraw their own report from. */
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

  // Ownership and status in the predicate rather than in a prior read: this is
  // what stops a reporter editing someone else's report, or their own after a
  // coordinator has published it.
  const { count } = await prisma.incident.updateMany({
    where: {
      id: incidentId,
      villageId,
      reporterId: session.user.id,
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
      },
    },
  });

  revalidatePath(`/incidents/${incidentId}`);
  revalidatePath("/incidents");

  redirect(`/incidents/${incidentId}`);
}

/**
 * The reporter withdrawing their own report.
 *
 * A hard delete, because a report that never got past the queue was never part
 * of the village record and leaving a tombstone would keep the reporter's
 * verbatim words on file after they asked for them to go. Media and tags
 * cascade; the `AuditLog` row does not, because `entityId` is a plain string
 * with no foreign key — which is exactly what makes the trail append-only
 * (domain rule 7).
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

  const incident = await prisma.incident.findFirst({
    where: {
      id: incidentId,
      villageId,
      reporterId: session.user.id,
      status: { in: [...REPORTER_EDITABLE] },
    },
    select: { id: true, reference: true, type: true, status: true },
  });

  if (!incident) {
    return {
      ok: false,
      message: "This report can no longer be withdrawn — it has been reviewed.",
    };
  }

  // Audited before the delete, so the row describing what went is written while
  // there is still something to describe.
  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: session.profile?.role,
      villageId,
      action: "incident.delete",
      entityType: "Incident",
      entityId: incident.id,
      before: {
        reference: incident.reference,
        type: incident.type,
        status: incident.status,
      },
    },
  });

  await prisma.incident.delete({ where: { id: incident.id } });

  revalidatePath("/incidents");
  revalidatePath("/dashboard");

  redirect("/incidents");
}
