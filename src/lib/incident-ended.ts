import type { Session } from "@/lib/auth";
import { auditContext } from "@/lib/audit-context";
import { isCoordinatorRole } from "@/lib/constants";
import { LIVE_WINDOW_HOURS } from "@/lib/incident-live";
import { prisma } from "@/lib/prisma";

/**
 * "It's over now" — the reporter, or a coordinator, saying the thing a report
 * describes has stopped. Writes `Incident.endedAt` and nothing else.
 *
 * It is deliberately not a resolution. Resolving is a coordinator's act, with a
 * note the village reads and messages to the reporter and every voter; this is
 * one tap from somebody standing at the window, and its only effect is that the
 * report stops saying "Happening now". No notification, no status change, and
 * the report stays on the map exactly as it was.
 *
 * The rules mirror `setIncidentPoliceReference`, and live here rather than at
 * the server action so they are tested without a request context:
 *
 * - **Who:** the reporter on their own report, or a coordinator of the same
 *   village on any — the ownership clause is dropped for a coordinator rather
 *   than OR-ed in. Village off the session profile (domain rule 4).
 * - **What:** a published report or one still in the queue, inside the live
 *   window, not already ended. All of it in the write's own `where`, so two
 *   presses in the same second cannot both land and a report archived between
 *   the read and the write is not touched.
 * - **Audited** as `incident.ended`, after the write so the row describes a
 *   value the report now holds.
 */

export type MarkOverResult =
  | { ok: true; changed: boolean }
  | { ok: false; code: "not_found" | "no_village"; error: string };

const NOT_FOUND =
  "That report could not be found, or it can no longer be marked as over.";

const HOUR_MS = 60 * 60 * 1000;

export async function markIncidentOver(input: {
  session: Session;
  incidentId: string;
  /** The clock, passed in so the window is testable. */
  now?: Date;
}): Promise<MarkOverResult> {
  const { session, incidentId } = input;
  const now = input.now ?? new Date();

  const villageId = session.profile?.villageId;
  if (!villageId) {
    return {
      ok: false,
      code: "no_village",
      error: "Join a village before changing a report.",
    };
  }

  const coordinator = isCoordinatorRole(session.profile?.role);

  const scope = {
    id: incidentId,
    villageId,
    status: { in: ["PUBLISHED" as const, "PENDING_REVIEW" as const] },
    ...(coordinator ? {} : { reporterId: session.user.id }),
  };

  const current = await prisma.incident.findFirst({
    where: scope,
    select: { endedAt: true, occurredAt: true },
  });

  if (!current) return { ok: false, code: "not_found", error: NOT_FOUND };

  // Pressing it twice — two tabs, a slow network — is not an error and is not
  // a second row in the trail.
  if (current.endedAt) return { ok: true, changed: false };

  const { count } = await prisma.incident.updateMany({
    where: {
      ...scope,
      endedAt: null,
      occurredAt: { gt: new Date(now.getTime() - LIVE_WINDOW_HOURS * HOUR_MS) },
    },
    data: { endedAt: now },
  });

  if (count === 0) {
    // Either somebody else got there first, or the window closed between the
    // read and the write — in both cases there is nothing left to end.
    return { ok: true, changed: false };
  }

  const context = await auditContext();

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: session.profile?.role,
      villageId,
      action: "incident.ended",
      entityType: "Incident",
      entityId: incidentId,
      before: { endedAt: null },
      after: { endedAt: now.toISOString(), byCoordinator: coordinator },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    },
  });

  return { ok: true, changed: true };
}

/**
 * `endedAt` for one report, or null — read on its own rather than added to
 * `PUBLIC_INCIDENT_SELECT`, because that select is behind every incident read
 * in the app and a column the database does not have yet there would take the
 * map, the list and the dashboard down at once. Here a missing column costs
 * "Happening now" being derived from the time alone, which is what it would say
 * anyway until somebody pressed the button.
 */
export async function readIncidentEndedAt(
  incidentId: string,
  villageId: string,
): Promise<Date | null> {
  try {
    const row = await prisma.incident.findFirst({
      where: { id: incidentId, villageId },
      select: { endedAt: true },
    });
    return row?.endedAt ?? null;
  } catch (cause) {
    console.warn("[incident-ended] could not read ended_at", cause);
    return null;
  }
}
