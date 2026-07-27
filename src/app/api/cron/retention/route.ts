import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { cronUnauthorised, isCronAuthorised } from "@/lib/cron";
import { deleteExpiredRateLimits } from "@/lib/rate-limit";
import {
  STORAGE_BUCKET,
  createAdminClient,
  isStorageConfigured,
} from "@/lib/supabase/admin";
import {
  PUBLIC_INCIDENT_STATUSES,
  RATE_LIMIT_RETENTION_DAYS,
  RETENTION,
  RETENTION_MEDIA_BATCH,
  RETENTION_STORAGE_CHUNK,
} from "@/lib/constants";

/**
 * GET|POST /api/cron/retention — the nightly retention sweep, 02:00 UTC.
 *
 * The privacy policy has always stated a retention schedule; until now nothing
 * enforced it. A stated retention period that does not happen is a compliance
 * problem rather than a missing feature, which is why this route exists and why
 * it reads its numbers from `RETENTION` in `src/lib/constants.ts` — the same
 * constant `/privacy` renders. Change one and the other follows.
 *
 * Two things happen, in this order:
 *
 * 1. **Media older than `mediaDeleteMonths` is deleted**, objects first and
 *    rows second.
 * 2. **Reports older than `incidentArchiveMonths` move to `ARCHIVED`**, which
 *    takes them off the map and out of the public list without destroying the
 *    record.
 *
 * ## Why this is the most dangerous route in the app
 *
 * Everything else here either writes a row or reads one. This deletes files and
 * changes what residents can see, on a schedule, with nobody watching. So:
 *
 * - **`CRON_SECRET` is required**, compared in constant time, shared with the
 *   digest (`src/lib/cron.ts`). No secret means no sweep.
 * - **Objects are deleted before rows.** The reverse order would drop the only
 *   record of a path and orphan the file in the bucket forever. If the storage
 *   call fails, the rows stay and tomorrow's run retries them.
 * - **Nothing is deleted when storage is unconfigured.** A deployment with no
 *   service-role key cannot remove the objects, so it does not remove the rows
 *   that point at them either. It reports `skipped` and moves on.
 * - **Archiving is a status change, not a delete.** The incident, its audit
 *   trail and its reference survive; the map stops showing it. A parish that
 *   needs the year-old report for a police liaison meeting still has it.
 *
 * ## What this deliberately does not do
 *
 * - **`RETENTION.auditLogMonths` is not enforced here, and cannot be.**
 *   `audit_logs_append_only` in `prisma/sql/rls_policies.sql` rejects every
 *   UPDATE and DELETE on the trail *including from the table owner* — which is
 *   exactly the point of domain rule 7, and means expiring old audit rows is a
 *   deliberate DBA action rather than something a nightly job does by itself.
 * - **`RETENTION.inactiveAccountMonths` is not enforced here.** Closing an
 *   account means anonymising a profile *and* deleting the matching
 *   `auth.users` row, which is a Supabase Auth admin call with no undo. It
 *   wants its own route and its own review, not a quiet third step in a job
 *   that already deletes photographs.
 */

export const dynamic = "force-dynamic";

/** Same ceiling as the digest — 60s is what every Vercel plan allows. */
export const maxDuration = 60;

type MediaOutcome = {
  /** Rows examined this run, capped at `RETENTION_MEDIA_BATCH`. */
  considered: number;
  /** Objects removed from the bucket. Counts both variants of each row. */
  objectsDeleted: number;
  /** `IncidentMedia` rows dropped once their objects were gone. */
  rowsDeleted: number;
  /** True when the batch cap was hit and tomorrow's run has more to do. */
  more: boolean;
  skipped?: "storage_not_configured";
};

type VillageOutcome = {
  villageId: string;
  archived: number;
  mediaRowsDeleted: number;
};

async function runRetention(request: NextRequest) {
  if (!isCronAuthorised(request)) return cronUnauthorised();

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "The database is not configured on this deployment." },
      { status: 503 },
    );
  }

  const now = new Date();
  const mediaCutoff = monthsBefore(now, RETENTION.mediaDeleteMonths);
  const archiveCutoff = monthsBefore(now, RETENTION.incidentArchiveMonths);

  // Media first. It is the irreversible half, so it runs while the full 60
  // seconds are still available rather than after a long archive pass.
  const media = await deleteExpiredMedia(mediaCutoff);
  const archive = await archiveExpiredIncidents(archiveCutoff);

  const villages = mergeOutcomes(archive, media.byVillage);

  await recordSweep({ villages, now, mediaCutoff, archiveCutoff });

  // Last, because it is the one part of this job that is not about privacy and
  // the one whose failure costs nothing. A `rate_limit` row holds an auth user
  // id, an action name and a count; nothing in `/privacy` states a period for
  // it and `RATE_LIMIT_RETENTION_DAYS` is deliberately not in `RETENTION`
  // alongside the four that are. It rides here because this is the only job
  // that runs nightly, and the table is the only one in the schema with no
  // natural ceiling. A failure is logged and swallowed — the sweep above has
  // already deleted files, and throwing now would make a completed run look
  // failed and invite a retry that deletes a second batch of media.
  let rateLimitsDeleted: number | null = null;

  try {
    rateLimitsDeleted = await deleteExpiredRateLimits(now);
  } catch (cause) {
    console.error("Retention: could not sweep the rate limit table", cause);
  }

  return NextResponse.json({
    ranAt: now.toISOString(),
    archive: {
      cutoff: archiveCutoff.toISOString(),
      archived: villages.reduce((sum, v) => sum + v.archived, 0),
    },
    media: {
      cutoff: mediaCutoff.toISOString(),
      considered: media.outcome.considered,
      objectsDeleted: media.outcome.objectsDeleted,
      rowsDeleted: media.outcome.rowsDeleted,
      more: media.outcome.more,
      skipped: media.outcome.skipped,
    },
    rateLimits: {
      keepDays: RATE_LIMIT_RETENTION_DAYS,
      // Null when the sweep threw. Distinct from 0, which is a clean run with
      // nothing old enough to drop.
      deleted: rateLimitsDeleted,
    },
    villages,
  });
}

// ---------------------------------------------------------------------------
// Archiving
// ---------------------------------------------------------------------------

/**
 * Moves reports past the archive age out of the public statuses.
 *
 * Keyed on `reportedAt`, not `occurredAt`. A retention period runs from when
 * the data was collected, and `occurredAt` is whatever the reporter typed —
 * someone filing today about a break-in they remembered from two years ago
 * should not have their report archived the moment it clears moderation.
 *
 * Per-village rather than one sweeping `updateMany` because the count each
 * village gets in its audit row has to be the number of rows this run actually
 * changed, not a count taken a moment earlier.
 */
async function archiveExpiredIncidents(cutoff: Date): Promise<VillageOutcome[]> {
  // Not `as const`: Prisma's generated `in` filter takes a mutable array, and a
  // readonly tuple is not assignable to it.
  const where = {
    status: { in: [...PUBLIC_INCIDENT_STATUSES] },
    reportedAt: { lt: cutoff },
  };

  const groups = await prisma.incident.groupBy({
    by: ["villageId"],
    where,
    _count: { _all: true },
  });

  const outcomes: VillageOutcome[] = [];

  for (const group of groups) {
    const { count } = await prisma.incident.updateMany({
      where: { ...where, villageId: group.villageId },
      data: { status: "ARCHIVED" },
    });

    if (count > 0) {
      outcomes.push({
        villageId: group.villageId,
        archived: count,
        mediaRowsDeleted: 0,
      });
    }
  }

  return outcomes;
}

// ---------------------------------------------------------------------------
// Media deletion
// ---------------------------------------------------------------------------

/**
 * Deletes stored photos and video past the media retention age.
 *
 * Both variants of each row go: `storagePath` is the blurred upload the browser
 * produced and `redactedPath` is the copy served once `redactedAt` is set. The
 * unblurred original never existed on the server (domain rule 3), so there is
 * no third file to chase.
 *
 * The row is dropped only after `remove()` returns without an error. Supabase
 * does not treat an already-missing object as a failure, so a row whose file
 * has gone by other means still clears on the first attempt rather than being
 * retried nightly forever.
 */
async function deleteExpiredMedia(cutoff: Date): Promise<{
  outcome: MediaOutcome;
  byVillage: Map<string, number>;
}> {
  const byVillage = new Map<string, number>();

  const rows = await prisma.incidentMedia.findMany({
    where: { createdAt: { lt: cutoff } },
    select: {
      id: true,
      storagePath: true,
      redactedPath: true,
      incident: { select: { villageId: true } },
    },
    orderBy: { createdAt: "asc" },
    take: RETENTION_MEDIA_BATCH,
  });

  const outcome: MediaOutcome = {
    considered: rows.length,
    objectsDeleted: 0,
    rowsDeleted: 0,
    more: rows.length === RETENTION_MEDIA_BATCH,
  };

  if (rows.length === 0) return { outcome, byVillage };

  if (!isStorageConfigured) {
    // Deleting the rows would leave the objects in the bucket with nothing left
    // pointing at them — unreachable, undeletable, and still resident data.
    console.warn(
      "Retention: %d media row(s) are past their retention date but Supabase " +
        "Storage is not configured, so nothing was deleted.",
      rows.length,
    );
    outcome.skipped = "storage_not_configured";
    return { outcome, byVillage };
  }

  const storage = createAdminClient().storage.from(STORAGE_BUCKET);

  for (const chunk of chunked(rows, RETENTION_STORAGE_CHUNK)) {
    const paths = chunk.flatMap((row) =>
      [row.storagePath, row.redactedPath].filter(
        (path): path is string => typeof path === "string" && path.length > 0,
      ),
    );

    if (paths.length > 0) {
      const { data, error } = await storage.remove(paths);

      if (error) {
        // Leave the rows alone. Tomorrow's run finds them again, and until then
        // the objects are still accounted for.
        console.error(
          "Retention: could not delete %d object(s) from %s",
          paths.length,
          STORAGE_BUCKET,
          error,
        );
        continue;
      }

      outcome.objectsDeleted += data?.length ?? 0;
    }

    const { count } = await prisma.incidentMedia.deleteMany({
      where: { id: { in: chunk.map((row) => row.id) } },
    });

    outcome.rowsDeleted += count;

    for (const row of chunk) {
      const villageId = row.incident.villageId;
      byVillage.set(villageId, (byVillage.get(villageId) ?? 0) + 1);
    }
  }

  return { outcome, byVillage };
}

// ---------------------------------------------------------------------------
// The trail
// ---------------------------------------------------------------------------

/**
 * One `AuditLog` row per village per run, written only when something actually
 * changed.
 *
 * Per village rather than per incident on purpose. A sweep that archives four
 * hundred reports would otherwise write four hundred rows and bury every human
 * action in the trail for that month — and the question a coordinator asks of
 * the audit viewer is "what happened to my village's reports", which one row
 * with the counts and the cutoffs answers better than four hundred.
 *
 * `actorId` is null because nobody did this. `actorRole` says `system` so the
 * viewer has something to render in the actor column.
 */
async function recordSweep(input: {
  villages: readonly VillageOutcome[];
  now: Date;
  mediaCutoff: Date;
  archiveCutoff: Date;
}): Promise<void> {
  const rows = input.villages.filter(
    (village) => village.archived > 0 || village.mediaRowsDeleted > 0,
  );

  if (rows.length === 0) return;

  try {
    await prisma.auditLog.createMany({
      data: rows.map((village) => ({
        actorId: null,
        actorRole: "system",
        villageId: village.villageId,
        action: "retention.sweep",
        entityType: "village",
        entityId: village.villageId,
        after: {
          archivedIncidents: village.archived,
          deletedMedia: village.mediaRowsDeleted,
          archiveCutoff: input.archiveCutoff.toISOString(),
          mediaCutoff: input.mediaCutoff.toISOString(),
          incidentArchiveMonths: RETENTION.incidentArchiveMonths,
          mediaDeleteMonths: RETENTION.mediaDeleteMonths,
        },
      })),
    });
  } catch (cause) {
    // The deletes have already happened. Losing the trail entry is bad, and
    // throwing here would make a successful sweep look like a failed one and
    // invite a retry that deletes a second batch.
    console.error("Retention: could not write the audit trail", cause);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mergeOutcomes(
  archive: readonly VillageOutcome[],
  media: ReadonlyMap<string, number>,
): VillageOutcome[] {
  const merged = new Map<string, VillageOutcome>();

  for (const village of archive) {
    merged.set(village.villageId, { ...village });
  }

  for (const [villageId, mediaRowsDeleted] of media) {
    const existing = merged.get(villageId);

    if (existing) existing.mediaRowsDeleted += mediaRowsDeleted;
    else merged.set(villageId, { villageId, archived: 0, mediaRowsDeleted });
  }

  return [...merged.values()];
}

/**
 * `months` calendar months back from `from`.
 *
 * `setMonth` handles the short-month case the way retention wants it: 31 March
 * minus one month is 3 March, not 31 February, so nothing is ever kept longer
 * than the stated period because of the calendar.
 */
function monthsBefore(from: Date, months: number): Date {
  const cutoff = new Date(from);
  cutoff.setMonth(cutoff.getMonth() - months);
  return cutoff;
}

function* chunked<T>(items: readonly T[], size: number): Generator<T[]> {
  for (let index = 0; index < items.length; index += size) {
    yield items.slice(index, index + size);
  }
}

export const POST = runRetention;

/** Vercel Cron issues a `GET`. Same handler, same secret — as with the digest. */
export const GET = runRetention;
