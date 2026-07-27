import type { Session } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The legal compliance gate. **Server only.**
 *
 * A village accepts no report until its coordinator has read and accepted two
 * documents: the Data Protection Impact Assessment (`docs/DPIA.md`) and the
 * Appropriate Policy Document (`docs/APD_TEMPLATE.md`).
 *
 * ## Why this is a gate and not a checklist item
 *
 * Reports describe suspected criminal activity, which is **criminal offence
 * data** under UK GDPR Article 10. Article 10 permits processing it only where
 * domestic law authorises it, and the authorisation here is DPA 2018 s.10(5)
 * with Schedule 1 Part 2 paragraph 10 — preventing or detecting unlawful acts.
 * Paragraph 5 of that Schedule makes an Appropriate Policy Document a
 * **condition** of relying on paragraph 10.
 *
 * So a village processing reports without an APD in place is not a village with
 * incomplete paperwork. It is a village whose processing has no lawful
 * authorisation. That is why this blocks filing rather than showing a reminder,
 * and why nothing here is dismissible.
 *
 * ## Two documents, two acceptances, two audit rows
 *
 * They could have been one checkbox. They are not, because they answer to two
 * different instruments — Article 35 and Schedule 1 paragraph 5 — and a
 * regulator asking "when did the controller adopt its APD" is entitled to an
 * answer that is not "at the same time as something else". Each acceptance
 * records who and when, and writes its own `AuditLog` row.
 *
 * ## The three states, and why "unavailable" is one of them
 *
 * The columns arrive with `20260728090000_village_compliance_gate`. Until that
 * migration runs, a query naming them throws — and this check sits in front of
 * every report filed in the app.
 *
 * So it distinguishes "not accepted" from "no column to accept into", the same
 * way `getVillageParishCouncil` does, and the two fail in **opposite
 * directions**:
 *
 * - **Not accepted** blocks filing. That is the gate doing its job.
 * - **No column** allows filing, loudly. A missing migration is a deployment
 *   fault, not a council's decision, and taking every village's reporting
 *   offline because a `SELECT` named a column that is not there yet would be a
 *   compliance feature causing the outage it exists to prevent. The dashboard
 *   says the migration is missing and names it; the server logs it on every
 *   check.
 * - **Any other database error** blocks. It is the same reasoning
 *   `getVillageAutoApprove` uses: if we do not know what the council decided,
 *   the safe guess is the one that does not process. Filing needs the database
 *   for its real work anyway, so this refuses to be the thing that pretends
 *   otherwise.
 */

/** One document's acceptance. */
export type DocumentAcceptance = {
  acceptedAt: Date;
  /** The coordinator who accepted, when their profile still resolves. */
  acceptedBy: { id: string; fullName: string; email: string } | null;
};

export type ComplianceStatus =
  | {
      /** The columns exist, so the answer below is the council's own. */
      available: true;
      dpia: DocumentAcceptance | null;
      apd: DocumentAcceptance | null;
      /** Both accepted — the village may accept reports. */
      complete: boolean;
    }
  | {
      /**
       * `20260728090000_village_compliance_gate` has not been applied here.
       * Nothing can be accepted and nothing is blocked; see the header.
       */
      available: false;
      dpia: null;
      apd: null;
      complete: boolean;
    };

/**
 * Postgres `42703` — undefined column — however Prisma happens to surface it.
 *
 * Three shapes, for the reason `isMissingParishCouncilColumn` gives in
 * `src/lib/village.ts`: the column is in `schema.prisma` and missing from the
 * database, which Prisma reports differently depending on how the statement was
 * built. Matched narrowly on purpose — a broad catch here would swallow a
 * genuinely unreachable database and let reports through on a deployment where
 * nothing works.
 */
function isMissingComplianceColumn(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;

  const code = (cause as { code?: unknown }).code;
  if (code === "P2022" || code === "42703") return true;

  const message = (cause as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    (message.includes("dpia_accepted") || message.includes("apd_accepted"))
  );
}

const UNAVAILABLE: ComplianceStatus = {
  available: false,
  dpia: null,
  apd: null,
  // True, and this is the load-bearing line in the module. See the header: an
  // unapplied migration must not take every village's reporting offline.
  complete: true,
};

/** What `/dashboard/compliance` renders and what the gate is decided from. */
export async function getVillageCompliance(
  villageId: string,
): Promise<ComplianceStatus> {
  if (!process.env.DATABASE_URL) return UNAVAILABLE;

  try {
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: {
        dpiaAcceptedAt: true,
        apdAcceptedAt: true,
        dpiaAcceptedBy: {
          select: { id: true, fullName: true, email: true },
        },
        apdAcceptedBy: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!village) {
      // No village is not the same as no columns. A caller holding a village id
      // that resolves to nothing has a bigger problem than compliance, and it
      // must not read as "accepted".
      return { available: true, dpia: null, apd: null, complete: false };
    }

    const dpia = village.dpiaAcceptedAt
      ? { acceptedAt: village.dpiaAcceptedAt, acceptedBy: village.dpiaAcceptedBy }
      : null;

    const apd = village.apdAcceptedAt
      ? { acceptedAt: village.apdAcceptedAt, acceptedBy: village.apdAcceptedBy }
      : null;

    return {
      available: true,
      dpia,
      apd,
      complete: dpia !== null && apd !== null,
    };
  } catch (cause) {
    if (isMissingComplianceColumn(cause)) {
      console.error(
        "villages.dpia_accepted_at / apd_accepted_at are missing, so the " +
          "compliance gate cannot be enforced and reporting is being allowed. " +
          "Has 20260728090000_village_compliance_gate been applied?",
        cause,
      );

      return UNAVAILABLE;
    }

    console.error(
      "Could not read the compliance state for village %s; refusing reports",
      villageId,
      cause,
    );

    return { available: true, dpia: null, apd: null, complete: false };
  }
}

/**
 * The one question `POST /api/incidents` and the wizard host ask.
 *
 * Deliberately not a boolean on its own: the two callers that block need to
 * render a different sentence when the reason is an unapplied migration, and
 * collapsing that into `false` would tell a resident to contact a coordinator
 * who has nothing to click.
 */
export async function canVillageAcceptIncidents(
  villageId: string,
): Promise<boolean> {
  const status = await getVillageCompliance(villageId);
  return status.complete;
}

/**
 * What a resident is told when their village has not completed the gate.
 *
 * A constant rather than a string at each call site, because it is rendered by
 * a Server Component, a Client Component and a JSON route, and three copies of
 * a sentence about a legal obligation is three chances for one of them to
 * become wrong.
 */
export const COMPLIANCE_BLOCKED_MESSAGE =
  "Your village coordinator needs to complete the compliance setup before " +
  "incidents can be reported. Contact your coordinator.";

export type ComplianceAcceptance = {
  /** Accept the Data Protection Impact Assessment. */
  dpia: boolean;
  /** Accept the Appropriate Policy Document. */
  apd: boolean;
};

export type ComplianceWrite =
  | { ok: true; accepted: ComplianceAcceptance; complete: boolean }
  | { ok: false; reason: "unmigrated" | "nothing_selected" | "failed"; error: string };

/**
 * Records a coordinator's acceptance of one or both documents.
 *
 * Three rules, and the first two are what stop this being a toggle:
 *
 * 1. **Acceptance is one-way.** There is no unaccept, and this never clears a
 *    timestamp. A council that adopted an APD on a date did adopt it on that
 *    date, and a screen that could rewrite that would make the record worthless
 *    to the regulator it exists for. Withdrawing from the processing is
 *    suspending the village, which is a different act with its own audit row.
 * 2. **An already-accepted document is left exactly as it was.** Re-accepting
 *    must not move the timestamp onto today or replace the name of the person
 *    who actually read it — the annual review is a new signature on the paper
 *    document, not a second click here. Ticking a box that is already recorded
 *    is a no-op that reports success, because from the coordinator's side
 *    nothing is wrong.
 * 3. **The village id comes from the caller's session, never from the form.**
 *    Domain rule 4. A village id in a form post would be a way to accept a
 *    neighbouring parish's legal documents on their behalf.
 *
 * Returns rather than throws, and distinguishes `unmigrated` from `failed`,
 * because "try again" is a lie when the column does not exist — the coordinator
 * could press that button until somebody runs a migration and it would never
 * work.
 */
export async function acceptCompliance(input: {
  session: Session;
  villageId: string;
  accept: ComplianceAcceptance;
}): Promise<ComplianceWrite> {
  const { session, villageId, accept } = input;

  if (!accept.dpia && !accept.apd) {
    return {
      ok: false,
      reason: "nothing_selected",
      error: "Tick both boxes to accept the documents.",
    };
  }

  if (!process.env.DATABASE_URL) {
    return {
      ok: false,
      reason: "failed",
      error: "The database is not configured.",
    };
  }

  const current = await getVillageCompliance(villageId);

  if (!current.available) {
    return {
      ok: false,
      reason: "unmigrated",
      error:
        "This deployment's database does not have the compliance columns yet. " +
        "An administrator needs to apply the migration " +
        "20260728090000_village_compliance_gate before acceptance can be recorded.",
    };
  }

  const now = new Date();

  // Only the documents that are both ticked and not already recorded. Rule 2 —
  // an existing acceptance is a fact about a date, not a field to refresh.
  const writeDpia = accept.dpia && current.dpia === null;
  const writeApd = accept.apd && current.apd === null;

  if (writeDpia || writeApd) {
    try {
      await prisma.village.update({
        where: { id: villageId },
        data: {
          ...(writeDpia
            ? { dpiaAcceptedAt: now, dpiaAcceptedById: session.user.id }
            : {}),
          ...(writeApd
            ? { apdAcceptedAt: now, apdAcceptedById: session.user.id }
            : {}),
        },
      });
    } catch (cause) {
      console.error(
        "Could not record compliance acceptance for village %s",
        villageId,
        cause,
      );

      return {
        ok: false,
        reason: "failed",
        error: "Could not record your acceptance. Try again.",
      };
    }

    // After the write, and allowed to fail silently, on the same reasoning every
    // other post-hoc audit write in the codebase uses: the acceptance has
    // happened, and telling a coordinator it failed when it succeeded would be
    // false. What makes that acceptable here is that the acceptance is *also*
    // recorded on the village row itself, with a timestamp and a person — this
    // trail row is the second copy, not the only one.
    try {
      await prisma.auditLog.createMany({
        data: [
          ...(writeDpia
            ? [
                {
                  actorId: session.user.id,
                  actorEmail: session.user.email,
                  actorRole: session.profile?.role,
                  villageId,
                  action: "compliance.dpia_accepted",
                  entityType: "Village",
                  entityId: villageId,
                  after: { acceptedAt: now.toISOString(), document: "DPIA" },
                },
              ]
            : []),
          ...(writeApd
            ? [
                {
                  actorId: session.user.id,
                  actorEmail: session.user.email,
                  actorRole: session.profile?.role,
                  villageId,
                  action: "compliance.apd_accepted",
                  entityType: "Village",
                  entityId: villageId,
                  after: {
                    acceptedAt: now.toISOString(),
                    document: "Appropriate Policy Document",
                  },
                },
              ]
            : []),
        ],
      });
    } catch (cause) {
      console.error(
        "Compliance acceptance for village %s was recorded but not audited",
        villageId,
        cause,
      );
    }
  }

  return {
    ok: true,
    accepted: accept,
    // Recomputed from what was already there plus what was just written, rather
    // than re-reading: the caller revalidates the page, and the answer here is
    // what decides whether the success message says the village is now open.
    complete:
      (current.dpia !== null || writeDpia) && (current.apd !== null || writeApd),
  };
}
