import type { IncidentStatus } from "@/generated/prisma/enums";
import type { Session } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  notifyIncidentPublished,
  notifyReporterOfDecision,
} from "@/lib/notifications";

/**
 * Coordinator actions on a report, and the audit trail they owe.
 *
 * Everything a moderator can do to an incident goes through here rather than
 * being written out at each call site, because each action carries three
 * obligations that are easy to do twice and easier to forget once:
 *
 * 1. **Scope the write by village.** A coordinator moderates their own village
 *    and no other (domain rule 4). The `updateMany` calls below all carry
 *    `villageId`, so a crafted incident id from another village updates zero
 *    rows rather than the wrong one.
 * 2. **Write an `AuditLog` row.** Append-only, never updated or deleted
 *    (domain rule 7). Publishing is the moment a report becomes visible to a
 *    few hundred neighbours; there has to be a record of who decided that.
 * 3. **Guard the status transition.** Publishing is only valid from the review
 *    queue, and archiving only from a published state. Without the `status`
 *    predicate, two coordinators clicking Approve at the same time would both
 *    fire a village-wide push for the same report.
 */

export type ModerationAction = "PUBLISH" | "REJECT" | "RESOLVE" | "ARCHIVE";

export type ModerationOutcome =
  | { ok: true; status: IncidentStatus; reference: string; notified: number }
  | { ok: false; error: string };

/** Which statuses each action is allowed to move a report out of. */
const ALLOWED_FROM = {
  PUBLISH: ["DRAFT", "PENDING_REVIEW"],
  REJECT: ["DRAFT", "PENDING_REVIEW"],
  RESOLVE: ["PUBLISHED"],
  ARCHIVE: ["PUBLISHED", "RESOLVED", "REJECTED"],
} as const satisfies Record<ModerationAction, readonly IncidentStatus[]>;

const NEXT_STATUS = {
  PUBLISH: "PUBLISHED",
  REJECT: "REJECTED",
  RESOLVE: "RESOLVED",
  ARCHIVE: "ARCHIVED",
} as const satisfies Record<ModerationAction, IncidentStatus>;

/** Past participles, because "resolveed" is what appending "ed" gets you. */
const ACTION_VERB = {
  PUBLISH: "published",
  REJECT: "rejected",
  RESOLVE: "resolved",
  ARCHIVE: "archived",
} as const satisfies Record<ModerationAction, string>;

export async function applyModeration(input: {
  session: Session;
  villageId: string;
  incidentId: string;
  action: ModerationAction;
  note?: string;
}): Promise<ModerationOutcome> {
  const { session, villageId, incidentId, action, note } = input;

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "The database is not configured." };
  }

  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, villageId },
    select: {
      id: true,
      reference: true,
      status: true,
      severity: true,
      title: true,
      locationText: true,
      lat: true,
      lng: true,
      occurredAt: true,
      reporterId: true,
    },
  });

  if (!incident) {
    return { ok: false, error: "That report is not in your village." };
  }

  const allowed: readonly IncidentStatus[] = ALLOWED_FROM[action];

  if (!allowed.includes(incident.status)) {
    return {
      ok: false,
      error: `A ${incident.status.toLowerCase().replace("_", " ")} report cannot be ${ACTION_VERB[action]}.`,
    };
  }

  const status = NEXT_STATUS[action];
  const now = new Date();

  // Conditional on the status we just read, so the second of two concurrent
  // approvals updates nothing and never reaches the push below.
  const { count } = await prisma.incident.updateMany({
    where: { id: incidentId, villageId, status: incident.status },
    data: {
      status,
      moderatedById: session.user.id,
      moderatedAt: now,
      moderationNote: note,
      resolvedAt: status === "RESOLVED" ? now : undefined,
    },
  });

  if (count === 0) {
    return { ok: false, error: "Someone else reviewed that report first." };
  }

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: session.profile?.role,
      villageId,
      action: `incident.${action.toLowerCase()}`,
      entityType: "Incident",
      entityId: incidentId,
      before: { status: incident.status },
      after: { status, note: note ?? null },
    },
  });

  let notified = 0;

  if (action === "PUBLISH") {
    // The village hears about it now, and only now — a report in the queue has
    // not cleared moderation and must not reach residents (domain rule 6).
    const broadcast = await notifyIncidentPublished({
      id: incident.id,
      villageId,
      title: incident.title,
      severity: incident.severity,
      locationText: incident.locationText,
      lat: incident.lat,
      lng: incident.lng,
      occurredAt: incident.occurredAt,
    });

    notified = broadcast.sent;
  }

  if (action === "PUBLISH" || action === "REJECT") {
    await notifyReporterOfDecision({
      villageId,
      reporterId: incident.reporterId,
      incidentId: incident.id,
      reference: incident.reference,
      published: action === "PUBLISH",
      note,
    });
  }

  return { ok: true, status, reference: incident.reference, notified };
}

/**
 * Reads the reporter's verbatim words, and records that it happened.
 *
 * `rawDescription` is the one column with no anonymisation between it and a
 * resident's name, plate or address. A coordinator is entitled to read it — it
 * is often the only way to judge a report — but every read owes an `AuditLog`
 * row (domain rule 1), which is why this is a deliberate call and not a column
 * on any select.
 *
 * The audit row is written **before** the text is returned, so a caller that
 * crashes mid-render has still left the trail.
 */
export async function readRawDescription(input: {
  session: Session;
  villageId: string;
  incidentId: string;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const { session, villageId, incidentId } = input;

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "The database is not configured." };
  }

  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, villageId },
    select: { id: true, reference: true, rawDescription: true },
  });

  if (!incident) {
    return { ok: false, error: "That report is not in your village." };
  }

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: session.profile?.role,
      villageId,
      action: "incident.raw_viewed",
      entityType: "Incident",
      entityId: incidentId,
      after: { reference: incident.reference },
    },
  });

  return { ok: true, text: incident.rawDescription };
}
