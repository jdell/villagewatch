import type { Session } from "@/lib/auth";
import { isPlatformAdmin, isSuperAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatIncidentReference } from "@/lib/incident-reference";
import { COORDINATOR_ROLES } from "@/lib/constants";

/**
 * Merging one village into another — the generalised form of
 * `scripts/merge-histon-impington.sql`.
 *
 * **Server only.** It reads and rewrites every village-scoped table.
 *
 * That script was written to be reviewed once and run once by hand, against two
 * slugs hardcoded at the top of it. This is the same nine steps with the slugs
 * as arguments, behind `requireSuperAdmin()`. The script stays in the
 * repository as the reviewed reference: where the two disagree, read the SQL —
 * its header carries the reasoning in full and this module does not repeat all
 * of it.
 *
 * ## The three constraints that shape every step
 *
 * 1. **`audit_logs` is append-only at the database.** The
 *    `audit_logs_append_only` trigger rejects every DELETE including from the
 *    owner, and every UPDATE bar severing `actor_id`. So the trail cannot be
 *    moved with the reports, and the origin village **cannot be deleted** —
 *    `ON DELETE SET NULL` on `audit_logs.village_id` is an UPDATE the trigger
 *    refuses, so `DELETE FROM villages` fails. It is archived instead.
 *
 *    The consequence to say out loud, because a coordinator will notice it:
 *    the merged village's `/dashboard/audit` will not show the origin's
 *    history, because that viewer is scoped by `village_id`. The history is not
 *    gone; it is attached to a village nobody can open.
 *
 * 2. **`incidents_village_year_number_key`** is unique on
 *    `(villageId, referenceYear, villageIncidentNumber)`, so the moved reports
 *    have to be renumbered onto the end of the target's sequence and their
 *    `reference` strings rebuilt. That is the one step with a cost outside the
 *    database: a reference already quoted to a PCSO now names a report whose
 *    number has moved. The mapping is returned and stored on the audit row so
 *    an old reference can still be resolved by hand.
 *
 * 3. **Police rows are deleted, not moved.** `police_neighbourhoods` is unique
 *    per village and both villages may hold one; the figures were fetched for a
 *    map centre that is about to stop being used; and nothing is lost that
 *    data.police.uk will not publish again on the next weekly sync.
 *
 * ## What can be undone, and what cannot
 *
 * The audit row this writes carries **lists of ids**, not counts, and that is
 * the reason: once `users.village_id` has been rewritten there is nothing else
 * in the database that says who used to be in the origin village. Residents,
 * reports, alerts and applications each move back with one `updateMany` keyed
 * on those lists; references restore from `referenceMapping`; the police rows
 * return on the next sync.
 *
 * What cannot be undone is the audit trail itself, and the origin's join code —
 * this module nulls it and deliberately does not record it, because a
 * credential written into an append-only table is a credential that cannot be
 * rotated out of it.
 */

/**
 * Roles that carry coordinator access, as a mutable array for Prisma's `in`.
 * A coordinator of the origin village becomes a coordinator of the merged one;
 * the preview surfaces that because it is a privilege grant that would
 * otherwise happen silently.
 */
const COORDINATOR_ROLE_LIST = [...COORDINATOR_ROLES];

/**
 * Ceiling on how many reports one merge will move.
 *
 * Each numbered report is renumbered individually — its new number depends on
 * its position in the filing order, so there is no single `updateMany` that
 * expresses it — and all of them run inside one transaction. At a parish's
 * volume (`MAX_MAP_INCIDENTS` is 500 for the whole map) this is never reached.
 * It exists so that a village far outside that shape is **refused with a
 * sentence** rather than discovered when the transaction times out halfway and
 * rolls back with nothing on screen to say why.
 *
 * A deployment that legitimately needs to move more should run the reviewed SQL
 * script by hand, which does the renumbering in one statement.
 */
export const MAX_MERGE_INCIDENTS = 2000;

/**
 * How long the merge transaction may take.
 *
 * Prisma's default is five seconds, which a few hundred sequential updates will
 * exceed. The transaction is atomic either way — a timeout rolls the whole
 * thing back — so this buys a completed merge rather than a safe failure.
 */
const MERGE_TIMEOUT_MS = 120_000;
const MERGE_MAX_WAIT_MS = 10_000;

export type VillageMergeSide = {
  id: string;
  name: string;
  slug: string;
  status: string;
  residents: number;
  /** Residents holding coordinator access — a privilege grant, see below. */
  coordinators: number;
  incidents: number;
  /** Reports that will be renumbered. The rest keep their old reference. */
  numberedIncidents: number;
  patternAlerts: number;
  coordinatorRequests: number;
  policeCrimes: number;
  auditRows: number;
};

export type VillageMergePreview = {
  origin: VillageMergeSide;
  target: VillageMergeSide;
  /**
   * Why this merge cannot run, in words for the screen. Empty means it can.
   * Computed here rather than in the route so the button and the POST agree
   * about what is allowed — the POST re-checks all of it regardless.
   */
  blockers: string[];
  /**
   * Things that are true and will surprise somebody. Not blockers: an
   * administrator may proceed, having read them.
   */
  warnings: string[];
};

export type VillageMergeSummary = {
  originId: string;
  originName: string;
  targetId: string;
  targetName: string;
  renamedTo: string | null;
  usersMoved: number;
  incidentsMoved: number;
  incidentsRenumbered: number;
  patternAlertsMoved: number;
  coordinatorRequestsMoved: number;
  policeCrimesDeleted: number;
  auditTrailMoved: false;
  referenceMapping: {
    incidentId: string;
    from: string;
    to: string;
    referenceYear: number;
  }[];
};

export type VillageMergeResult =
  | { ok: true; summary: VillageMergeSummary }
  | { ok: false; error: string };

/** The columns every side of the preview needs. */
async function describeVillage(id: string): Promise<VillageMergeSide | null> {
  const village = await prisma.village.findUnique({
    where: { id },
    select: { id: true, name: true, slug: true, status: true },
  });

  if (!village) return null;

  const [
    residents,
    coordinators,
    incidents,
    numberedIncidents,
    patternAlerts,
    coordinatorRequests,
    policeCrimes,
    auditRows,
  ] = await Promise.all([
    prisma.user.count({ where: { villageId: id, deletedAt: null } }),
    prisma.user.count({
      where: { villageId: id, deletedAt: null, role: { in: COORDINATOR_ROLE_LIST } },
    }),
    prisma.incident.count({ where: { villageId: id } }),
    prisma.incident.count({
      where: {
        villageId: id,
        referenceYear: { not: null },
        villageIncidentNumber: { not: null },
      },
    }),
    prisma.patternAlert.count({ where: { villageId: id } }),
    prisma.coordinatorRequest.count({ where: { villageId: id } }),
    prisma.policeCrime.count({ where: { villageId: id } }),
    prisma.auditLog.count({ where: { villageId: id } }),
  ]);

  return {
    ...village,
    residents,
    coordinators,
    incidents,
    numberedIncidents,
    patternAlerts,
    coordinatorRequests,
    policeCrimes,
    auditRows,
  };
}

/**
 * `isComplete()` from `src/lib/compliance.ts`, over columns this module has
 * already read. Duplicated rather than imported because that function takes a
 * village id and re-queries, and the guard below already holds the row.
 *
 * Not advisory: if the target has not accepted the documents its mode calls
 * for, then the moment this commits every resident of **both** villages is
 * refused at `POST /api/incidents` — including the ones who could file this
 * morning. The fix is `/dashboard/compliance`, not this file.
 */
function isTargetCompliant(village: {
  mode: string;
  communityDpaAcceptedAt: Date | null;
  dpiaAcceptedAt: Date | null;
  apdAcceptedAt: Date | null;
  dpaAcceptedAt: Date | null;
}): boolean {
  if (village.mode === "community") {
    return village.communityDpaAcceptedAt !== null;
  }

  return (
    (village.dpiaAcceptedAt !== null &&
      village.apdAcceptedAt !== null &&
      village.dpaAcceptedAt !== null) ||
    village.communityDpaAcceptedAt !== null
  );
}

/**
 * What a merge would move, and whether it may run at all.
 *
 * Read-only — this is Section 1 of the SQL script, which exists so that
 * whoever presses the button has read the numbers first. Returns null when
 * either village is missing rather than throwing: the caller renders a message,
 * and an id that does not resolve is a stale page rather than an error.
 */
export async function previewVillageMerge(
  originId: string,
  targetId: string,
): Promise<VillageMergePreview | null> {
  if (!process.env.DATABASE_URL) return null;

  const [origin, target] = await Promise.all([
    describeVillage(originId),
    describeVillage(targetId),
  ]);

  if (!origin || !target) return null;

  const targetRow = await prisma.village.findUnique({
    where: { id: targetId },
    select: {
      mode: true,
      communityDpaAcceptedAt: true,
      dpiaAcceptedAt: true,
      apdAcceptedAt: true,
      dpaAcceptedAt: true,
    },
  });

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (origin.id === target.id) {
    blockers.push("The origin and target are the same village.");
  }

  if (target.status !== "ACTIVE") {
    blockers.push(
      `${target.name} is ${target.status.toLowerCase()}, not active. Merging into a village that is not in service would take both offline at once.`,
    );
  }

  if (targetRow && !isTargetCompliant(targetRow)) {
    blockers.push(
      `${target.name} has not accepted the documents its ${targetRow.mode} model requires. Merging now would close reporting for everybody in both villages — accept them on /dashboard/compliance first.`,
    );
  }

  if (origin.incidents > MAX_MERGE_INCIDENTS) {
    blockers.push(
      `${origin.name} holds ${origin.incidents} reports, over the ${MAX_MERGE_INCIDENTS} this tool will move in one transaction. Use scripts/merge-histon-impington.sql.`,
    );
  }

  if (origin.coordinators > 0) {
    warnings.push(
      `${origin.coordinators} coordinator${origin.coordinators === 1 ? "" : "s"} of ${origin.name} will become coordinator${origin.coordinators === 1 ? "" : "s"} of ${target.name}, with the resident email reveal and the audited read of reporters' verbatim words that carries.`,
    );
  }

  if (origin.auditRows > 0) {
    warnings.push(
      `${origin.auditRows} audit entries stay attached to ${origin.name} and will not appear in ${target.name}'s audit trail. The trail is append-only and cannot be moved.`,
    );
  }

  if (origin.numberedIncidents > 0) {
    warnings.push(
      `${origin.numberedIncidents} report references will change. Anything already quoted to a police officer will name a different number — the old-to-new mapping is recorded on the audit entry.`,
    );
  }

  if (origin.policeCrimes > 0) {
    warnings.push(
      `${origin.policeCrimes} Home Office crime records for ${origin.name} will be deleted. The weekly sync refetches them for whichever village centre is live.`,
    );
  }

  return { origin, target, blockers, warnings };
}

/**
 * Merge `originId` into `targetId`. One transaction: it all lands or none does.
 *
 * Every guard is re-checked inside the transaction rather than trusted from the
 * preview — the preview is a screen somebody read a minute ago, and the village
 * may have been suspended since.
 *
 * Never throws for an expected refusal. The caller is a route handler that owes
 * the browser a sentence, and "that village is no longer active" is an ordinary
 * answer rather than a 500.
 */
export async function mergeVillages(input: {
  session: Session;
  originId: string;
  targetId: string;
  /** Optional new display name for the target. Null renames nothing. */
  renameTo?: string | null;
}): Promise<VillageMergeResult> {
  const { session, originId, targetId } = input;
  const renameTo = input.renameTo?.trim() || null;

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "The database is not configured." };
  }

  // Both, for the reason `requireSuperAdmin` checks both. This is the module
  // boundary and it re-checks rather than trusting the route that called it,
  // the way `villages.ts` re-checks beside each privilege.
  if (!isPlatformAdmin(session) || !isSuperAdmin(session)) {
    return {
      ok: false,
      error: "Only a super administrator can merge villages.",
    };
  }

  if (originId === targetId) {
    return { ok: false, error: "The origin and target are the same village." };
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const origin = await tx.village.findUnique({
          where: { id: originId },
          select: { id: true, name: true, slug: true, status: true },
        });

        const target = await tx.village.findUnique({
          where: { id: targetId },
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            villageCode: true,
            mode: true,
            communityDpaAcceptedAt: true,
            dpiaAcceptedAt: true,
            apdAcceptedAt: true,
            dpaAcceptedAt: true,
          },
        });

        if (!origin) {
          return { ok: false as const, error: "The origin village no longer exists." };
        }
        if (!target) {
          return { ok: false as const, error: "The target village no longer exists." };
        }
        if (target.status !== "ACTIVE") {
          return {
            ok: false as const,
            error: `${target.name} is not active. Merging into a village that is not in service would take both offline at once.`,
          };
        }
        if (!isTargetCompliant(target)) {
          return {
            ok: false as const,
            error: `${target.name} has not accepted the documents its ${target.mode} model requires. Merging now would close reporting for everybody in both villages.`,
          };
        }

        const incidentCount = await tx.incident.count({
          where: { villageId: originId },
        });

        if (incidentCount > MAX_MERGE_INCIDENTS) {
          return {
            ok: false as const,
            error: `${origin.name} holds ${incidentCount} reports, over the ${MAX_MERGE_INCIDENTS} this tool moves in one transaction.`,
          };
        }

        // --- Step 2: police figures go, they do not move --------------------
        // First, because it is the only step this module cannot itself reverse
        // and it is the one whose loss costs nothing — the weekly sync
        // refetches for whichever centre is live.
        const policeCrimesDeleted = (
          await tx.policeCrime.deleteMany({ where: { villageId: originId } })
        ).count;
        await tx.policeDataSync.deleteMany({ where: { villageId: originId } });
        await tx.policeNeighbourhood.deleteMany({
          where: { villageId: originId },
        });

        // --- Step 3: residents ----------------------------------------------
        // Ids captured before the write, because afterwards nothing in the
        // database says who used to be here. `role` and `verifiedAt` are
        // deliberately untouched: clearing verification would un-verify people
        // nobody asked about, and demoting a coordinator is a decision for a
        // person rather than a side effect of a merge.
        const movedUsers = await tx.user.findMany({
          where: { villageId: originId },
          select: { id: true },
        });
        await tx.user.updateMany({
          where: { villageId: originId },
          data: { villageId: targetId },
        });

        // --- Step 4: rename the target, before the references are built ------
        // Order matters: step 6 derives the reference code from the name, so a
        // rename after it would leave every rebuilt reference carrying the old
        // village's letters.
        if (renameTo && renameTo !== target.name) {
          await tx.village.update({
            where: { id: targetId },
            data: { name: renameTo },
          });
        }

        const targetForReference = {
          name: renameTo ?? target.name,
          villageCode: target.villageCode,
        };

        // --- Step 5: pattern alerts and coordinator applications -------------
        const movedAlerts = await tx.patternAlert.findMany({
          where: { villageId: originId },
          select: { id: true },
        });
        await tx.patternAlert.updateMany({
          where: { villageId: originId },
          data: { villageId: targetId },
        });

        const movedRequests = await tx.coordinatorRequest.findMany({
          where: { villageId: originId },
          select: { id: true },
        });
        await tx.coordinatorRequest.updateMany({
          where: { villageId: originId },
          data: { villageId: targetId },
        });

        // --- Step 6: incidents — renumber, rebuild the reference, then move ---
        //
        // Numbers continue from the target's highest for each year rather than
        // interleaving by date. An interleaved merge would renumber the
        // target's own reports too, which is a far larger blast radius for a
        // sequence nobody reads as continuous anyway.
        const highest = await tx.incident.groupBy({
          by: ["referenceYear"],
          where: {
            villageId: targetId,
            referenceYear: { not: null },
            villageIncidentNumber: { not: null },
          },
          _max: { villageIncidentNumber: true },
        });

        const nextNumber = new Map<number, number>();
        for (const row of highest) {
          if (row.referenceYear !== null) {
            nextNumber.set(row.referenceYear, row._max.villageIncidentNumber ?? 0);
          }
        }

        // `reportedAt, createdAt, id` — the ordering
        // `20260803120000_incident_village_numbering` uses. The sequence is a
        // filing order, and the id tiebreak makes a re-run against a restored
        // copy produce the same numbers.
        const numbered = await tx.incident.findMany({
          where: {
            villageId: originId,
            referenceYear: { not: null },
            villageIncidentNumber: { not: null },
          },
          select: {
            id: true,
            reference: true,
            referenceYear: true,
            villageIncidentNumber: true,
          },
          orderBy: [{ reportedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        });

        const referenceMapping: VillageMergeSummary["referenceMapping"] = [];

        for (const incident of numbered) {
          const year = incident.referenceYear as number;
          const allocated = (nextNumber.get(year) ?? 0) + 1;
          nextNumber.set(year, allocated);

          const newReference = formatIncidentReference(targetForReference, {
            reference: incident.reference,
            referenceYear: year,
            villageIncidentNumber: allocated,
          });

          await tx.incident.update({
            where: { id: incident.id },
            data: {
              villageId: targetId,
              villageIncidentNumber: allocated,
              reference: newReference,
            },
          });

          referenceMapping.push({
            incidentId: incident.id,
            from: incident.reference,
            to: newReference,
            referenceYear: year,
          });
        }

        // Reports filed before the per-village scheme existed. They keep their
        // NULLs and their old strings — NULLs are distinct in the unique index
        // so they collide with nothing, and giving them a number would invent a
        // sequence position they never had.
        const unnumbered = await tx.incident.findMany({
          where: { villageId: originId },
          select: { id: true },
        });
        await tx.incident.updateMany({
          where: { villageId: originId },
          data: { villageId: targetId },
        });

        // --- Step 7: archive the origin --------------------------------------
        // Archived rather than deleted — see the module header. The join code
        // goes because an archived village holding a live code is a credential
        // nobody is watching, and because `joinCode` is unique, so leaving it
        // would reserve the string against re-minting it somewhere it is
        // wanted. The compliance timestamps are left alone: somebody accepted
        // those documents on a date and that remains true.
        await tx.village.update({
          where: { id: originId },
          data: { status: "ARCHIVED", joinCode: null },
        });

        // --- Step 8: the audit trail is NOT moved ----------------------------
        // Nothing happens here, on purpose, and the absence is the
        // documentation. See the module header for what it costs.

        // --- Step 9: record the merge ----------------------------------------
        // Against the TARGET, so it is readable by the coordinators who have to
        // live with the result. `before` carries the id lists because it is the
        // only thing that makes a reversal possible at all.
        const summary: VillageMergeSummary = {
          originId,
          originName: origin.name,
          targetId,
          targetName: renameTo ?? target.name,
          renamedTo: renameTo && renameTo !== target.name ? renameTo : null,
          usersMoved: movedUsers.length,
          incidentsMoved: numbered.length + unnumbered.length,
          incidentsRenumbered: numbered.length,
          patternAlertsMoved: movedAlerts.length,
          coordinatorRequestsMoved: movedRequests.length,
          policeCrimesDeleted,
          auditTrailMoved: false,
          referenceMapping,
        };

        await tx.auditLog.create({
          data: {
            actorId: session.user.id,
            actorEmail: session.user.email,
            // `"PLATFORM_ADMIN"` rather than the actor's `User.role`, the way
            // `activateVillage` does it: the authority here is membership of
            // the two environment lists, and an administrator's profile may say
            // RESIDENT or may not exist at all.
            actorRole: "PLATFORM_ADMIN",
            villageId: targetId,
            action: "village.merged",
            entityType: "village",
            entityId: originId,
            before: {
              originVillageId: originId,
              originSlug: origin.slug,
              originName: origin.name,
              originStatus: origin.status,
              movedUserIds: movedUsers.map((u) => u.id),
              movedPatternAlertIds: movedAlerts.map((a) => a.id),
              movedCoordinatorRequestIds: movedRequests.map((r) => r.id),
              movedUnnumberedIncidentIds: unnumbered.map((i) => i.id),
              referenceMapping,
            },
            after: {
              targetVillageId: targetId,
              targetSlug: target.slug,
              targetName: renameTo ?? target.name,
              usersMoved: summary.usersMoved,
              incidentsMoved: summary.incidentsMoved,
              incidentsRenumbered: summary.incidentsRenumbered,
              originStatus: "ARCHIVED",
              auditTrailMoved: false,
              policeDataDeleted: true,
              via: "/admin/villages/merge",
            },
          },
        });

        return { ok: true as const, summary };
      },
      { timeout: MERGE_TIMEOUT_MS, maxWait: MERGE_MAX_WAIT_MS },
    );
  } catch (error) {
    console.error("[village-merge] merge failed and rolled back", error);
    return {
      ok: false,
      error:
        "The merge failed and nothing was changed. The whole thing runs in one transaction, so both villages are as they were.",
    };
  }
}

/** One row in the merge selectors. */
export type MergeCandidate = {
  id: string;
  name: string;
  slug: string;
  status: string;
  residents: number;
  incidents: number;
  /** Residents or reports — the thing that makes a `PENDING` parish worth listing. */
  hasData: boolean;
};

/**
 * The villages a merge can pick between.
 *
 * ## Why this is not simply "everything that is not archived"
 *
 * It was, and at a directory of 271 parishes that produced a 271-item
 * `<select>` of which one entry was joinable and 270 were empty seeded rows —
 * and the national seed is 10,670. The list has to be narrow enough to read,
 * and it cannot be narrowed to `ACTIVE`, because the case this tool exists for
 * is exactly a village that is **not** active and does hold data: two parishes
 * that ought to be one, where residents have already joined the wrong half.
 *
 * So the rule is `ACTIVE` **or** holds something — any resident or any report.
 * That covers every village a merge could sensibly name on either side and
 * excludes the seeded directory, which is inert by definition. The screen
 * defaults to the `ACTIVE` subset and offers the rest behind a checkbox, so the
 * common case is a two-item list and the real case is one click away.
 *
 * `ARCHIVED` stays out of both. It is where a merge *leaves* a village, and
 * offering one as an origin would invite merging the same village twice.
 *
 * ## Three queries, whatever the directory holds
 *
 * The two `groupBy`s return one row per village that has rows at all, which is
 * a handful — not one row per parish. Both are covered by existing indexes
 * (`@@index([villageId, role])` on users, `@@index([villageId, status,
 * occurredAt])` on incidents). Counting with `_count` on a `findMany` over
 * every village instead would be a subquery per parish, which is the shape that
 * stops working at 10,670.
 *
 * Residents exclude closed accounts (`deletedAt`), matching
 * `previewVillageMerge` — a selector saying twelve residents beside a preview
 * saying nine is the kind of disagreement that stops somebody trusting either.
 */
export async function listMergeableVillages(): Promise<MergeCandidate[]> {
  if (!process.env.DATABASE_URL) return [];

  const [residentRows, incidentRows] = await Promise.all([
    prisma.user.groupBy({
      by: ["villageId"],
      where: { villageId: { not: null }, deletedAt: null },
      _count: { _all: true },
    }),
    prisma.incident.groupBy({
      by: ["villageId"],
      _count: { _all: true },
    }),
  ]);

  const residents = new Map<string, number>();
  for (const row of residentRows) {
    if (row.villageId) residents.set(row.villageId, row._count._all);
  }

  const incidents = new Map<string, number>();
  for (const row of incidentRows) {
    incidents.set(row.villageId, row._count._all);
  }

  const withData = [
    ...new Set([...residents.keys(), ...incidents.keys()]),
  ];

  const villages = await prisma.village.findMany({
    where: {
      status: { not: "ARCHIVED" },
      OR: [{ status: "ACTIVE" }, { id: { in: withData } }],
    },
    select: { id: true, name: true, slug: true, status: true },
    orderBy: [{ status: "asc" }, { name: "asc" }],
  });

  return villages.map((v) => {
    const residentCount = residents.get(v.id) ?? 0;
    const incidentCount = incidents.get(v.id) ?? 0;

    return {
      ...v,
      residents: residentCount,
      incidents: incidentCount,
      hasData: residentCount > 0 || incidentCount > 0,
    };
  });
}
