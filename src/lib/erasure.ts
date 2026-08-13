import { Prisma } from "@/generated/prisma/client";
import type { IncidentStatus } from "@/generated/prisma/enums";
import type { Session } from "@/lib/auth";
import { auditContext } from "@/lib/audit-context";
import { prisma } from "@/lib/prisma";
import { deleteStoredObjects } from "@/lib/media/storage";

/**
 * The right to erasure — UK GDPR Article 17. **Server only.**
 *
 * A resident can take back a report they filed, and can close their account
 * entirely. Both go through here rather than being written out at the three call
 * sites (the DELETE route, the detail page's action, the settings action),
 * because erasure has an order of operations that is easy to get subtly wrong:
 *
 * 1. **Objects before rows.** Deleting the `IncidentMedia` row first would drop
 *    the only record of the storage path and orphan the file in the bucket
 *    forever — unreachable, undeletable, and still a photograph of somebody's
 *    neighbour. The retention job takes the same care for the same reason.
 * 2. **The audit row before the change.** It describes what went, so it is
 *    written while there is still something to describe.
 * 3. **The incident row survives.** `AuditLog.entityId` points at it, and the
 *    trail is append-only (domain rule 7) — a hard delete would leave the trail
 *    naming an id that resolves to nothing, which is the opposite of the
 *    accountability record it exists to be. `REMOVED` is off every public
 *    surface, out of the moderation queue, and out of pattern detection, so
 *    nothing renders it and nothing counts it.
 *
 * ## What actually gets destroyed
 *
 * The media, the tags, and every column that held a person's words or position
 * — `TOMBSTONE` below is the list. A status flip on its own would be erasure in
 * the interface and nothing at all in the database: `rawDescription` would still
 * hold the reporter's verbatim words, names and plates and addresses included
 * (domain rule 1), after they had asked for them to go.
 *
 * That is not a hypothetical. The withdraw button this replaces **hard-deleted**
 * the row, and said why: "leaving a tombstone would keep the reporter's verbatim
 * words on file after they asked for them to go." Keeping the row for the audit
 * trail's sake is the right call, but it only stays the right call if the row
 * that survives has nothing left in it.
 */

/** What replaces the reporter's words. Rendered wherever a tombstone surfaces. */
export const ERASED_TITLE = "Erased report";

export const ERASED_TEXT =
  "This report was erased at the request of the person who filed it.";

/** What replaces a closed account's display name. */
export const CLOSED_ACCOUNT_NAME = "Former resident";

/**
 * Whether a report is still the reporter's to erase.
 *
 * Every status except `REMOVED`, which is only "already done". Deliberately not
 * a narrower list: the withdraw button covered the queue only, on the reasoning
 * that a published report belongs to the village — which is a fair account of
 * *editing* and no account at all of erasure. Article 17 does not stop applying
 * because a coordinator pressed Approve, or Reject, and the previous shape of
 * this was internally inconsistent anyway: it allowed a `PUBLISHED` report to be
 * erased but not a `REJECTED` one, which is the report most likely to be full of
 * a resident's unedited words and the least likely to be part of any record the
 * village needs.
 *
 * What survives is the coordinator's decision, on the audit trail, where it
 * belongs — not the text they decided about.
 */
export function canReporterErase(status: IncidentStatus): boolean {
  return status !== "REMOVED";
}

/**
 * The columns a tombstone clears.
 *
 * Written out as one object rather than assembled, so that what survives erasure
 * is a list somebody can read in one go and argue with. Anything not named here
 * survives: `reference`, `villageId`, `type`, `severity`, `occurredAt`,
 * `reportedAt`, the moderation timestamps and the view counts. None of those is
 * personal data on its own, and together they are what lets a village keep an
 * honest count of what was reported in a month without keeping a word of what
 * was said about it.
 *
 * `reporterId` is severed — it is the last link between the row and a person,
 * and the foreign key is `ON DELETE SET NULL` precisely so a report can outlive
 * its reporter. One consequence worth knowing rather than discovering: the
 * reporter cannot see their own tombstone afterwards, because every
 * reporter-scoped query keys on that column. That is the intended reading of
 * "erased", not an oversight.
 *
 * Clearing `lat`/`lng` clears the PostGIS point for free —
 * `incidents_location_point_trigger` nulls `location_point` whenever either
 * coordinate is null, so no geography column is left holding the position.
 */
const TOMBSTONE = {
  status: "REMOVED",
  reporterId: null,
  title: ERASED_TITLE,
  description: ERASED_TEXT,
  rawDescription: ERASED_TEXT,
  aiSummary: null,
  patternNote: null,
  recurring: false,
  peopleCount: null,
  // The landmark and the pin are both ways to find a person.
  locationText: null,
  lat: null,
  lng: null,
  reportedToPolice: false,
  policeReference: null,
  // Written by a coordinator about this report, and often quoting its reporter.
  moderationNote: null,
  isAnonymous: true,
  // `Unchecked`, not `IncidentUpdateManyMutationInput`: the checked variant
  // omits every foreign-key scalar in favour of a nested relation write, and
  // `reporterId` is the one column here that has to be set directly. There is no
  // relation form of "point this at nobody".
} as const satisfies Prisma.IncidentUncheckedUpdateManyInput;

export type ErasureFailure =
  | "not_configured"
  | "not_found"
  | "forbidden"
  | "failed";

export type RemoveIncidentResult =
  | {
      ok: true;
      reference: string;
      /** Storage objects removed. Counts both variants of each media row. */
      objectsDeleted: number;
      /** `IncidentMedia` rows dropped once their objects were gone. */
      mediaRowsDeleted: number;
      tagsDeleted: number;
      /** Set when storage could not be reached and the files are still there. */
      mediaSkipped?: "storage_not_configured" | "storage_error";
    }
  | { ok: false; reason: ErasureFailure; error: string };

/**
 * Deletes the stored objects behind a set of media rows, then the rows.
 *
 * Both variants of each row go: `storagePath` is the blurred upload the browser
 * produced and `redactedPath` is the copy served once `redactedAt` is set. The
 * unblurred original never existed on the server (domain rule 3), so there is no
 * third file to chase. The video thumbnail sits at `{path}-thumb.jpg` and is
 * derived from the same name, matching what `DELETE /api/incidents/media` does
 * for an abandoned upload.
 *
 * Returns what it managed. A storage failure is reported rather than thrown:
 * erasure of the report itself must not be blocked by a bucket being
 * unreachable, and the rows are left in place so the nightly retention sweep
 * finds the files again.
 */
async function deleteMediaFor(incidentIds: readonly string[]): Promise<{
  objectsDeleted: number;
  mediaRowsDeleted: number;
  skipped?: "storage_not_configured" | "storage_error";
}> {
  if (incidentIds.length === 0) {
    return { objectsDeleted: 0, mediaRowsDeleted: 0 };
  }

  const rows = await prisma.incidentMedia.findMany({
    where: { incidentId: { in: [...incidentIds] } },
    select: { id: true, storagePath: true, redactedPath: true },
  });

  if (rows.length === 0) return { objectsDeleted: 0, mediaRowsDeleted: 0 };

  const removed = await deleteStoredObjects(
    rows.flatMap((row) =>
      [
        row.storagePath,
        row.redactedPath,
        // The still generated for a clip, keyed off the same name. Speculative
        // for an image, where there is no such object — `deleteStoredObjects`
        // treats a path that was not there as nothing to report.
        row.storagePath.replace(/\.[^.]+$/, "-thumb.jpg"),
      ].filter((path): path is string => Boolean(path)),
    ),
  );

  if (removed === null) {
    // The same call the retention job makes: dropping the rows would leave the
    // objects in the bucket with nothing pointing at them.
    console.warn(
      "Erasure: %d media row(s) belong to an erased report but Supabase " +
        "Storage is not configured, so no files were deleted.",
      rows.length,
    );

    return {
      objectsDeleted: 0,
      mediaRowsDeleted: 0,
      skipped: "storage_not_configured",
    };
  }

  if (removed.failed > 0) {
    // Leave every row alone rather than guess which ones survived. The rows are
    // what the nightly retention sweep works from, so keeping them is what makes
    // the files reachable for a retry; deleting them would orphan the objects
    // permanently. The report is still erased either way — this only decides
    // whether the bucket gets tidied tonight or in six months.
    return {
      objectsDeleted: removed.deleted,
      mediaRowsDeleted: 0,
      skipped: "storage_error",
    };
  }

  const { count: mediaRowsDeleted } = await prisma.incidentMedia.deleteMany({
    where: { id: { in: rows.map((row) => row.id) } },
  });

  return { objectsDeleted: removed.deleted, mediaRowsDeleted };
}

/**
 * Erases one report at its reporter's request.
 *
 * The village is checked before the reporter, and the difference in what comes
 * back is deliberate: a report in another village is `not_found`, because
 * answering `forbidden` would confirm that a report with that id exists
 * somewhere (domain rule 4). Only a report the caller can already see, and did
 * not file, is `forbidden`.
 */
export async function removeIncident(input: {
  session: Session;
  villageId: string;
  incidentId: string;
}): Promise<RemoveIncidentResult> {
  const { session, villageId, incidentId } = input;

  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      reason: "not_configured",
      error: "The database is not configured.",
    };
  }

  const incident = await prisma.incident.findFirst({
    where: { id: incidentId, villageId },
    select: { id: true, reference: true, type: true, status: true, reporterId: true },
  });

  // A report in another village, or one that is already erased, is a 404 rather
  // than a 403: telling somebody that a report exists but is not theirs confirms
  // it exists (domain rule 4).
  if (!incident || incident.status === "REMOVED") {
    return {
      ok: false,
      reason: "not_found",
      error: "That report could not be found.",
    };
  }

  if (incident.reporterId !== session.user.id) {
    return {
      ok: false,
      reason: "forbidden",
      error: "Only the person who filed a report can delete it.",
    };
  }

  // Written before anything goes, so the row describing what was erased exists
  // while there is still something to describe.
  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: session.profile?.role,
      villageId,
      action: "incident.deleted",
      entityType: "Incident",
      entityId: incident.id,
      before: {
        reference: incident.reference,
        type: incident.type,
        status: incident.status,
      },
      after: { status: "REMOVED" },
      ...(await auditContext()),
    },
  });

  const media = await deleteMediaFor([incident.id]);

  const { count: tagsDeleted } = await prisma.incidentTag.deleteMany({
    where: { incidentId: incident.id },
  });

  // Conditional on the status just read, so a coordinator moderating the same
  // report at the same moment does not have their decision silently overwritten
  // — the loser of that race gets "could not be found" and can look again.
  const { count } = await prisma.incident.updateMany({
    where: {
      id: incident.id,
      villageId,
      reporterId: session.user.id,
      status: incident.status,
    },
    data: TOMBSTONE,
  });

  if (count === 0) {
    return {
      ok: false,
      reason: "not_found",
      error: "That report was reviewed while you were deleting it. Look again.",
    };
  }

  return {
    ok: true,
    reference: incident.reference,
    objectsDeleted: media.objectsDeleted,
    mediaRowsDeleted: media.mediaRowsDeleted,
    tagsDeleted,
    mediaSkipped: media.skipped,
  };
}

export type EraseAccountResult =
  | {
      ok: true;
      incidentsRemoved: number;
      objectsDeleted: number;
      mediaRowsDeleted: number;
      tagsDeleted: number;
      mediaSkipped?: "storage_not_configured" | "storage_error";
    }
  | { ok: false; reason: ErasureFailure; error: string };

/**
 * Closes a resident's own account.
 *
 * Everything they filed goes to `REMOVED`, their media is deleted from storage
 * and their tags are dropped — the same erasure `removeIncident` performs, over
 * every report at once.
 *
 * **The `User` row stays**, and so does the Supabase `auth.users` row.
 * `AuditLog.actorId` and `Incident.reporterId` both point at the profile, and
 * both are the record of who did what; deleting it would sever a trail that is
 * meant to be append-only (domain rule 7). `deletedAt` is what actually closes
 * the account, and three places read it: `POST /api/auth/login` refuses the
 * sign-in, `/api/auth/callback` sends a Google sign-in the same way, and
 * `(app)/layout.tsx` turns a session that is already open into `/account-closed`.
 * `residentsToNotify` reads it too, so nothing is pushed to a closed account.
 *
 * It is deliberately not enforced inside `getSession()`. That returns null for
 * "signed out", `requireSession()` sends null to `/login`, and `src/proxy.ts`
 * bounces a signed-in browser off `/login` — a closed account would ricochet
 * between the two forever. The gates above are the three places that can
 * actually say what happened.
 *
 * The same statuses are in scope as for a single report — every one except
 * `REMOVED` (`canReporterErase`). The two are the same question asked at
 * different scope, and the answer to "close my account" is all of it.
 */
export async function eraseAccount(input: {
  session: Session;
}): Promise<EraseAccountResult> {
  const { session } = input;

  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      reason: "not_configured",
      error: "The database is not configured.",
    };
  }

  const villageId = session.profile?.villageId ?? null;

  const incidents = await prisma.incident.findMany({
    where: { reporterId: session.user.id, status: { not: "REMOVED" } },
    select: { id: true },
  });

  const incidentIds = incidents.map((incident) => incident.id);

  // Before anything goes, as above. `entityId` is the user's own id — this is
  // the one audit action whose subject is an account rather than a report.
  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: session.profile?.role,
      villageId,
      action: "account.deleted",
      entityType: "User",
      entityId: session.user.id,
      before: { incidents: incidentIds.length },
      after: { deletedAt: new Date().toISOString() },
      // The row that outlives the account. `actorId` is severed by the FK
      // cascade moments later — that one UPDATE is the trigger's single
      // carve-out — so the address here is part of what is left describing it.
      ...(await auditContext()),
    },
  });

  const media = await deleteMediaFor(incidentIds);

  let tagsDeleted = 0;
  let incidentsRemoved = 0;

  if (incidentIds.length > 0) {
    ({ count: tagsDeleted } = await prisma.incidentTag.deleteMany({
      where: { incidentId: { in: incidentIds } },
    }));

    ({ count: incidentsRemoved } = await prisma.incident.updateMany({
      where: { id: { in: incidentIds } },
      data: TOMBSTONE,
    }));
  }

  // Two tables hold the resident's own words and their own devices rather than a
  // record of anything anyone decided, so neither has a trail argument keeping
  // it. A `Notification` row is one delivery to one person and is meaningless
  // once there is nobody to deliver to; a pending `CoordinatorRequest` is worse
  // than meaningless — it holds the applicant's reason in their own words and
  // would otherwise sit in the admin queue waiting to promote a closed account.
  await Promise.all([
    prisma.notification.deleteMany({ where: { userId: session.user.id } }),
    prisma.coordinatorRequest.deleteMany({
      where: { userId: session.user.id, status: "PENDING" },
    }),
  ]);

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        deletedAt: new Date(),

        // Everything on the profile that describes where the resident lives or
        // how to reach them. None of it is part of the record this row is kept
        // for: `Incident.reporterId` and `AuditLog.actorId` need an id, and the
        // trail denormalises `actorEmail` and `actorRole` precisely so it does
        // not depend on these columns. `homeLat`/`homeLng` go first — an
        // approximate home location is the most re-identifying coordinate in
        // the system, which is why it is jittered on the way in.
        addressLine: null,
        homeLat: null,
        homeLng: null,
        phone: null,
        avatarUrl: null,
        // A live Web Push endpoint for a device the resident still owns.
        // `Prisma.DbNull` rather than `null`: on a `Json?` column a bare null is
        // ambiguous between "SQL NULL" and "the JSON value null", so Prisma
        // refuses it and makes the caller say which. SQL NULL is the one that
        // means the column is empty.
        pushSubscription: Prisma.DbNull,

        // The name goes too. The trail's answer to "who did this" is
        // `actorEmail`, denormalised onto every row for exactly this moment, and
        // the audit viewer already falls back to it — so keeping a departed
        // resident's name on a profile buys the record nothing it does not
        // already have, and a name is the plainest identifier there is.
        fullName: CLOSED_ACCOUNT_NAME,

        // `email` stays. It is this row's unique key and the Supabase
        // `auth.users` row holds the same address regardless, so scrubbing this
        // copy would protect nothing and would cost the two sign-in gates the
        // thing they match on. Deleting the auth row is what actually removes
        // it, and that is still the open half of this — see the note above.

        // A closed account is not a resident of anywhere. Leaving `villageId`
        // set would keep it inside the tenant boundary every query scopes by
        // (domain rule 4), and leaving `role` would let a closed coordinator
        // account be reopened into its old access if the auth row is ever
        // revived.
        villageId: null,
        role: "RESIDENT",
        verifiedAt: null,
        verifiedById: null,

        // A closed account is not a muted one — but nothing should be trying to
        // reach it either way, and `residentsToNotify` reads this column too.
        // Belt and braces on the surface that lands on a lock screen.
        notifyPush: false,
        notifyEmail: false,
        notifySms: false,
      },
    });
  } catch (cause) {
    // The reports are already erased, which is the half that matters. Report the
    // failure rather than swallowing it: the account is still open, and the
    // resident has to be told that rather than shown a confirmation.
    console.error("Could not close account %s", session.user.id, cause);

    return {
      ok: false,
      reason: "failed",
      error:
        "Your reports were deleted but the account could not be closed. Try again, or contact your coordinator.",
    };
  }

  return {
    ok: true,
    incidentsRemoved,
    objectsDeleted: media.objectsDeleted,
    mediaRowsDeleted: media.mediaRowsDeleted,
    tagsDeleted,
    mediaSkipped: media.skipped,
  };
}
