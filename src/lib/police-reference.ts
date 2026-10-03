import type { Session } from "@/lib/auth";
import { auditContext } from "@/lib/audit-context";
import { PUBLIC_INCIDENT_STATUSES, isCoordinatorRole } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

/**
 * The police reference on a report already on the map.
 *
 * The wizard asks for one at filing, and that is the wrong moment for most
 * reporters: the reference arrives days later, by text or letter, after the
 * report has been published. Until this existed the only way to add it was a
 * coordinator asking for it and nobody being able to type it in.
 *
 * Two callers may write it, and the rule lives here rather than at the server
 * action so it can be tested without a request context:
 *
 * - **The reporter**, on their own report.
 * - **A coordinator of the same village**, on any report — the officer often
 *   gives the reference to whoever rang them, and that is frequently the
 *   coordinator rather than the resident who filed.
 *
 * Both are bounded the same way. **Published and resolved reports only**
 * (`PUBLIC_INCIDENT_STATUSES`): a report in the queue is still editable in full
 * through `editIncidentAction`, and one that was rejected, archived or erased is
 * not a report anybody should be annotating. **Village-scoped** from the
 * session profile (domain rule 4). Ownership, status and village are all in the
 * `where` of the write itself, not only in the read before it, so a report
 * published-then-archived between the two cannot be written.
 *
 * It is the one column on a published report that can still change, and the
 * reason that is safe is that it says nothing about what happened — it is a
 * pointer to somebody else's record of it. The description, the title and the
 * severity stay exactly as the village was alerted to them.
 */

export type PoliceReferenceResult =
  | { ok: true; changed: boolean; policeReference: string | null }
  | { ok: false; code: "not_found" | "no_village"; error: string };

const NOT_FOUND =
  "That report could not be found, or its police reference can no longer be changed.";

export async function setIncidentPoliceReference(input: {
  session: Session;
  incidentId: string;
  /** Already trimmed and validated; `null` removes the reference. */
  policeReference: string | null;
}): Promise<PoliceReferenceResult> {
  const { session, incidentId, policeReference } = input;

  // Off the revalidated session profile, never the payload (domain rules 4
  // and 5).
  const villageId = session.profile?.villageId;
  if (!villageId) {
    return {
      ok: false,
      code: "no_village",
      error: "Join a village before changing a report.",
    };
  }

  const coordinator = isCoordinatorRole(session.profile?.role);

  /*
    Written as a dropped clause rather than an `OR`, the shape
    `editIncidentAction` uses: a coordinator loses the ownership test and keeps
    everything else. A resident who is not the reporter gets the same answer as
    a report that does not exist — telling them it exists but is not theirs
    would confirm an id in their village they had no other way to learn.
  */
  const where = {
    id: incidentId,
    villageId,
    status: { in: [...PUBLIC_INCIDENT_STATUSES] },
    ...(coordinator ? {} : { reporterId: session.user.id }),
  };

  const current = await prisma.incident.findFirst({
    where,
    select: { policeReference: true, reportedToPolice: true },
  });

  if (!current) return { ok: false, code: "not_found", error: NOT_FOUND };

  // Pressing Save on an unchanged value writes nothing — no row, no audit
  // entry describing a change that did not happen.
  if ((current.policeReference ?? null) === policeReference) {
    return { ok: true, changed: false, policeReference };
  }

  /*
    A reference is proof the police were told, so adding one sets
    `reportedToPolice`. Removing one leaves the flag alone: the usual reason to
    clear a reference is that it was mistyped, not that the call never happened,
    and the detail page still says "Yes" rather than claiming the opposite.
  */
  const { count } = await prisma.incident.updateMany({
    where,
    data: {
      policeReference,
      ...(policeReference ? { reportedToPolice: true } : {}),
    },
  });

  if (count === 0) return { ok: false, code: "not_found", error: NOT_FOUND };

  // After the write, so the value it records is one the row now holds. Awaited
  // and not swallowed, as `editIncidentAction`'s row is.
  const context = await auditContext();

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: session.profile?.role,
      villageId,
      action: "incident.crime_reference_updated",
      entityType: "Incident",
      entityId: incidentId,
      before: {
        policeReference: current.policeReference,
        reportedToPolice: current.reportedToPolice,
      },
      after: {
        policeReference,
        reportedToPolice: policeReference ? true : current.reportedToPolice,
        // Which hat was worn — a coordinator can also be the reporter, and on
        // their own report both are true. `incident.edit` records the same.
        byCoordinator: coordinator,
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });

  return { ok: true, changed: true, policeReference };
}
