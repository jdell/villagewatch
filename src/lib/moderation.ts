import type { IncidentStatus } from "@/generated/prisma/enums";
import type { Session } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  notifyIncidentPublished,
  notifyReporterOfDecision,
} from "@/lib/notifications";
import { notifySlack } from "@/lib/slack";
import { formatIncidentAlert } from "@/lib/format-alert";
import { SEVERITY_META } from "@/lib/constants";

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
  | {
      ok: true;
      status: IncidentStatus;
      reference: string;
      notified: number;
      /**
       * The published report as WhatsApp-ready text, on a PUBLISH and nowhere
       * else. There is no relay that could post it (see
       * `src/lib/whatsapp-channel.ts`), so the coordinator who just approved it
       * is the one who posts it — and the moment they clicked Approve is the
       * moment they have it in front of them. Built here rather than in the
       * screen so the queue, the incident page and the server log all copy the
       * same text.
       */
      alert?: string;
    }
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
    // `REMOVED` is excluded here rather than left to `ALLOWED_FROM` below, which
    // would also reject it but with "an erased report cannot be published" — a
    // sentence that tells a coordinator a report they can no longer see still
    // exists. Not found is the honest answer (`src/lib/erasure.ts`).
    where: { id: incidentId, villageId, status: { not: "REMOVED" } },
    select: {
      id: true,
      reference: true,
      status: true,
      severity: true,
      title: true,
      // The anonymised public column, for the alert a coordinator pastes into
      // WhatsApp. `rawDescription` is deliberately absent from this select and
      // always has been (domain rule 1).
      description: true,
      recurring: true,
      patternNote: true,
      locationText: true,
      lat: true,
      lng: true,
      occurredAt: true,
      reporterId: true,
      // For the staff Slack line only.
      village: { select: { name: true } },
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
  let alert: string | undefined;

  if (action === "PUBLISH") {
    // The village hears about it now, and only now — a report in the queue has
    // not cleared moderation and must not reach residents (domain rule 6).
    const broadcast = await notifyIncidentPublished({
      id: incident.id,
      villageId,
      title: incident.title,
      severity: incident.severity,
      description: incident.description,
      recurring: incident.recurring,
      patternNote: incident.patternNote,
      locationText: incident.locationText,
      lat: incident.lat,
      lng: incident.lng,
      occurredAt: incident.occurredAt,
    });

    notified = broadcast.sent;

    // Handed back whatever the village's channel settings say, and deliberately
    // so: `logIncidentAlert` above respects `whatsappEnabled` and the severity
    // floor because it writes to a shared log, but this text goes to the one
    // coordinator who just approved this one report, into a clipboard, for them
    // to decide what to do with. A village that has not filled in the channel
    // form still has a parish mailing list.
    alert = formatIncidentAlert({
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      description: incident.description,
      locationText: incident.locationText,
      occurredAt: incident.occurredAt,
      recurring: incident.recurring,
      patternNote: incident.patternNote,
    });

    // The staff channel gets what the village got: the anonymised title, the
    // severity and the landmark. Never the coordinates, never the reporter's
    // wording — the same rule the WhatsApp Channel post follows, for the same
    // reason. Cannot throw, so it cannot fail a publish.
    await notifySlack(
      `🚨 New incident in ${incident.village.name}: ${SEVERITY_META[incident.severity].label} — ${incident.title}${
        incident.locationText ? ` — ${incident.locationText}` : ""
      }`,
    );
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

  return { ok: true, status, reference: incident.reference, notified, alert };
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
    // An erased report is not reachable through the audited reveal either.
    // `removeIncident` overwrites `rawDescription` with a tombstone, so there is
    // nothing left to disclose — but a reveal that returned the placeholder
    // would still write an `incident.raw_viewed` row against a report that no
    // longer has a reporter, which reads as a coordinator having looked at
    // somebody's words. Not found is the truthful answer.
    where: { id: incidentId, villageId, status: { not: "REMOVED" } },
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

// ---------------------------------------------------------------------------
// Auto-approve
// ---------------------------------------------------------------------------

/**
 * Whether this village publishes reports without a coordinator seeing them
 * first.
 *
 * Off for every village until somebody turns it on. What it removes is not a
 * formality: `POST /api/incidents` writes both `rawDescription` and
 * `description` from the same submission, and when the AI pass did not run —
 * no key, a timeout, a reporter who declined the rewrite — those two columns
 * hold the same text, which is the reporter's verbatim words. The moderation
 * queue is what has always caught that before a neighbour read it. With
 * auto-approve on, the reporter's own read of the preview step is the only
 * check there is.
 *
 * **It fails closed**, which is the opposite of the rate limiter and
 * deliberately so. A database error here means we do not know what the village
 * asked for, and the safe guess is the queue: a report that waits for a
 * coordinator who was not expecting it is an inconvenience, and a report
 * published because a `SELECT` failed is not recallable.
 */
export async function getVillageAutoApprove(villageId: string): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;

  try {
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: { autoApprove: true },
    });

    return village?.autoApprove ?? false;
  } catch (cause) {
    // The column arrives with a migration that may not have run yet, so a
    // deployment pointed at an older database throws here on every report.
    // Caught rather than propagated: filing must not fail because of a setting,
    // and the fallback is the behaviour every village had before this existed.
    console.error(
      "Could not read the auto-approve setting for village %s",
      villageId,
      cause,
    );
    return false;
  }
}

/**
 * Writes the village's auto-approve setting.
 *
 * Takes a `villageId` and never reads one — the caller resolves it from the
 * session profile (domain rule 4), because a village id in a form post is a way
 * to switch off a neighbouring parish's moderation.
 *
 * Unlike `getVillageAutoApprove` it **throws** on a database error, for the same
 * reason `saveVillageChannel` does: a save that failed silently would leave the
 * coordinator looking at a switch that reads as on and a queue that is still
 * filling up. The call site turns it into a message.
 */
export async function setVillageAutoApprove(
  villageId: string,
  autoApprove: boolean,
): Promise<void> {
  await prisma.village.update({
    where: { id: villageId },
    data: { autoApprove },
  });
}
