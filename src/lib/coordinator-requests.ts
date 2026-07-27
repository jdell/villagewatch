import type { CoordinatorRequestStatus } from "@/generated/prisma/enums";
import { isPlatformAdmin, type Session } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  notifyAdminsOfCoordinatorRequest,
  notifyApplicantOfCoordinatorDecision,
} from "@/lib/notifications";
import { notifySlack } from "@/lib/slack";
import { canApplyForCoordinator } from "@/lib/constants";
import type { CoordinatorRequestInput } from "@/lib/validations";

/**
 * Applying for coordinator access, deciding on an application, and the two
 * direct role changes an administrator can make from `/admin/villages/[id]`.
 *
 * This module is the only place `User.role` is ever moved into or out of
 * `COORDINATOR`. That is the whole point of it existing rather than the call
 * sites — the API route, the admin queue's server action, and now village
 * administration — each doing the work: a promotion here is the moment somebody
 * gains the ability to read their neighbours' verbatim reports and to decide
 * what the village sees, and it carries obligations that are easy to do twice
 * and easier to forget once.
 *
 * `appointCoordinator` at the bottom is the second way in, and it exists for a
 * reason the application flow structurally cannot cover: an application comes
 * *from* a resident of a village, so a village whose first coordinator does not
 * exist yet has nobody who can file one. See `src/lib/village.ts`.
 *
 * 1. **Roles come from the server** (domain rule 5). Nothing in either payload
 *    names a role, a village or a user — the applicant is the session, the
 *    village is their profile's, and the new role is a constant written here.
 * 2. **Every decision writes an `AuditLog` row** (domain rule 7). Granting
 *    coordinator access is the action that makes every future
 *    `incident.raw_viewed` row possible, so the trail has to start here.
 * 3. **The status transition is guarded.** `updateMany` carries
 *    `status: PENDING`, so two administrators clicking Approve on the same
 *    application at the same time produce one promotion and one "already
 *    decided", rather than two audit rows claiming the same thing.
 *
 * ## Why the reviewer is a platform administrator, not a village one
 *
 * Everywhere else in VillageWatch the village is the tenant boundary and an
 * `ADMIN` is scoped to their own (see `users_select_admin` in
 * `prisma/sql/rls_policies.sql`). Applications are deliberately the exception,
 * because of what the village directory is: `prisma/seed-villages.ts` seeds
 * 10,670 parishes with nobody in them at all. A village-scoped reviewer would
 * mean an application could only be approved by somebody who already has the
 * access being applied for — which is fine for village 1 and impossible for
 * every village after it. This is the flow that turns a `PENDING` directory
 * entry into a village with a coordinator, so its reviewer is platform-wide.
 */

export type CoordinatorRequestOutcome =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

export type CoordinatorDecision = "APPROVE" | "REJECT";

export type CoordinatorDecisionOutcome =
  | {
      ok: true;
      requestId: string;
      status: CoordinatorRequestStatus;
      applicantName: string;
      villageName: string;
    }
  | { ok: false; error: string };

/**
 * The applicant's latest application, whatever became of it.
 *
 * Latest rather than "the pending one": `/settings` has to render three states
 * — never applied, waiting, and declined-with-a-reason — and the third is only
 * reachable by reading a row that is not pending. Ordered by `createdAt` so a
 * resident who was declined and reapplied sees the new one.
 */
export async function getLatestCoordinatorRequest(userId: string) {
  if (!process.env.DATABASE_URL) return null;

  return prisma.coordinatorRequest.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      role: true,
      roleDetail: true,
      status: true,
      reviewNote: true,
      reviewedAt: true,
      createdAt: true,
    },
  });
}

/**
 * Files an application for the signed-in resident.
 *
 * The village is read from their profile and never from the input, so this
 * cannot become a way to apply to coordinate somewhere else (domain rule 4).
 */
export async function submitCoordinatorRequest(input: {
  session: Session;
  values: CoordinatorRequestInput;
}): Promise<CoordinatorRequestOutcome> {
  const { session, values } = input;
  const profile = session.profile;

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "The database is not configured." };
  }

  if (!profile?.villageId) {
    return {
      ok: false,
      error: "You need to be a member of a village before you can apply.",
    };
  }

  if (!canApplyForCoordinator(profile.role)) {
    // Covers the useful case as well as the hostile one: a resident who was
    // approved in another tab sees this instead of filing a second application.
    return {
      ok: false,
      error: "Your account already has coordinator access.",
    };
  }

  // Read-then-create rather than a partial unique index on
  // `(user_id) WHERE status = 'PENDING'`. Prisma cannot express a partial
  // index, so enforcing it in the database would mean a second object the
  // migrate engine cannot see and offers to drop on every diff — the problem
  // the PostGIS GiST indexes already cause. The race this leaves open is two
  // submissions in the same instant producing two pending rows, which costs an
  // administrator one extra click and loses nothing.
  const pending = await prisma.coordinatorRequest.findFirst({
    where: { userId: session.user.id, status: "PENDING" },
    select: { id: true },
  });

  if (pending) {
    return {
      ok: false,
      error: "You already have an application waiting to be reviewed.",
    };
  }

  const village = await prisma.village.findUnique({
    where: { id: profile.villageId },
    select: { id: true, name: true },
  });

  if (!village) {
    return { ok: false, error: "Your village could not be found." };
  }

  const request = await prisma.coordinatorRequest.create({
    data: {
      userId: session.user.id,
      villageId: village.id,
      role: values.role,
      roleDetail: values.roleDetail ?? null,
      reason: values.reason,
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: profile.role,
      villageId: village.id,
      action: "coordinator_request.created",
      entityType: "CoordinatorRequest",
      entityId: request.id,
      // The applicant's stated standing, but not their `reason`. The trail is
      // read by every coordinator in the village through `/dashboard/audit`,
      // and a free-text answer about why somebody wants the job is written for
      // the reviewer rather than for the parish.
      after: { role: values.role, status: "PENDING" },
    },
  });

  const alerted = await notifyAdminsOfCoordinatorRequest({
    villageId: village.id,
    villageName: village.name,
    applicantName: profile.fullName,
  });

  // Loud, because the failure it describes is invisible from inside the app: an
  // application accepted with nobody configured to review it looks identical to
  // a healthy one until somebody notices it has sat there for a fortnight.
  if (alerted.matched === 0) {
    console.warn(
      "Coordinator request %s has no administrator to review it — is ADMIN_EMAILS set, and does that account have a profile?",
      request.id,
    );
  }

  await notifySlack(
    `📋 Coordinator request: ${profile.fullName} wants coordinator access for ${village.name}`,
  );

  return { ok: true, requestId: request.id };
}

/**
 * Approves or rejects one application, and on approval performs the promotion.
 *
 * `session` must be an administrator. The caller has already checked — both of
 * them do — and it is checked again here, because this function is the thing
 * that writes `role: "COORDINATOR"` and a permission check belongs next to the
 * privilege it guards rather than only at the doors in front of it.
 */
export async function decideCoordinatorRequest(input: {
  session: Session;
  requestId: string;
  decision: CoordinatorDecision;
  note?: string | null;
}): Promise<CoordinatorDecisionOutcome> {
  const { session, requestId, decision, note } = input;

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "The database is not configured." };
  }

  if (!isPlatformAdmin(session)) {
    return {
      ok: false,
      error: "Only a platform administrator can decide an application.",
    };
  }

  const request = await prisma.coordinatorRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      userId: true,
      villageId: true,
      user: { select: { fullName: true, role: true, verifiedAt: true } },
      village: { select: { name: true } },
    },
  });

  if (!request) {
    return { ok: false, error: "That application no longer exists." };
  }

  if (request.status !== "PENDING") {
    return { ok: false, error: "Someone else reviewed that application first." };
  }

  const approved = decision === "APPROVE";
  const status: CoordinatorRequestStatus = approved ? "APPROVED" : "REJECTED";
  const now = new Date();

  // Conditional on the status just read, so the second of two concurrent
  // decisions updates nothing and never reaches the promotion below.
  const { count } = await prisma.coordinatorRequest.updateMany({
    where: { id: requestId, status: "PENDING" },
    data: {
      status,
      reviewedById: session.user.id,
      reviewedAt: now,
      reviewNote: note ?? null,
    },
  });

  if (count === 0) {
    return { ok: false, error: "Someone else reviewed that application first." };
  }

  /**
   * Only promote somebody who is not already there.
   *
   * `role: "COORDINATOR"` written unconditionally would be a demotion for an
   * applicant who has since become an `ADMIN` or a `MODERATOR` by another
   * route — an application from three weeks ago, approved today, silently
   * taking away access its approval was meant to grant. The reachable version
   * of that is an administrator clearing an old queue.
   */
  const promote = approved && canApplyForCoordinator(request.user.role);
  const newRole = promote ? "COORDINATOR" : request.user.role;

  if (promote) {
    await prisma.user.update({
      where: { id: request.userId },
      data: {
        role: "COORDINATOR",
        // An administrator approving somebody to coordinate a village has, in
        // the act, satisfied the question `verifiedAt` records — "does this
        // person really belong to this village". Only filled when it is empty,
        // so an existing verification keeps its original date and verifier.
        verifiedAt: request.user.verifiedAt ?? now,
        verifiedById: request.user.verifiedAt ? undefined : session.user.id,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorEmail: session.user.email,
      /**
       * `"PLATFORM_ADMIN"` rather than the actor's `User.role`, and it is the
       * one row in the trail that does not carry a `UserRole`.
       *
       * The authority for this action is membership of `ADMIN_EMAILS`, not the
       * role column — an administrator's profile may say `RESIDENT`, or they
       * may have no profile row at all. Writing `RESIDENT` here would put "a
       * resident promoted somebody to coordinator" in the audit trail, which
       * reads as the exact privilege escalation this record exists to rule out.
       * The viewer renders an unrecognised value verbatim, and `actorEmail`
       * beside it is the credential that was actually used.
       */
      actorRole: "PLATFORM_ADMIN",
      villageId: request.villageId,
      action: approved
        ? "coordinator_request.approved"
        : "coordinator_request.rejected",
      entityType: "CoordinatorRequest",
      entityId: requestId,
      before: { status: request.status, role: request.user.role },
      after: {
        status,
        // The promotion is the substance of an approval and belongs in the
        // trail as a role change, not only as an application status. An
        // approval that promoted nobody — because the applicant already had the
        // access — records the role it left alone.
        role: newRole,
        applicantId: request.userId,
        note: note ?? null,
      },
    },
  });

  await notifyApplicantOfCoordinatorDecision({
    villageId: request.villageId,
    userId: request.userId,
    approved,
    note,
  });

  // The reviewer's note is deliberately not in the Slack line. It is written by
  // one person to another about why they were turned down, and a staff channel
  // is not where that conversation belongs — the decision is the news.
  await notifySlack(
    approved
      ? `✅ ${request.user.fullName} approved as coordinator for ${request.village.name}`
      : `❌ ${request.user.fullName} rejected for ${request.village.name}`,
  );

  return {
    ok: true,
    requestId,
    status,
    applicantName: request.user.fullName,
    villageName: request.village.name,
  };
}

// ---------------------------------------------------------------------------
// Direct appointment, from village administration
// ---------------------------------------------------------------------------

export type AppointmentOutcome =
  | { ok: true; message: string; userId: string; fullName: string }
  | { ok: false; error: string };

/**
 * The audit row behind both functions below.
 *
 * `actorId` is null for an administrator with no profile row — the gate is an
 * address in `ADMIN_EMAILS`, not a `users` row, and the column is a foreign key.
 * Same reasoning as `actorIdFor` in `src/lib/village.ts`.
 */
async function auditRoleChange(input: {
  session: Session;
  villageId: string;
  action: string;
  subjectId: string;
  before: string;
  after: string;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: input.session.profile ? input.session.user.id : null,
        actorEmail: input.session.user.email ?? null,
        actorRole: "PLATFORM_ADMIN",
        villageId: input.villageId,
        action: input.action,
        entityType: "User",
        entityId: input.subjectId,
        before: { role: input.before },
        after: { role: input.after },
      },
    });
  } catch (cause) {
    console.error("Could not audit %s for %s", input.action, input.subjectId, cause);
  }
}

/**
 * Promotes one registered resident of one village to coordinator.
 *
 * The village is the caller's argument rather than the subject's own column, and
 * then checked against it — an appointment that silently followed the resident
 * to whichever village they belong to would be a way to hand somebody coordinator
 * access to a village the administrator never named (domain rule 4).
 *
 * Matched on email because that is what an administrator has: the parish clerk
 * gives them an address, not a user id. The lookup is case-insensitive, since an
 * address typed into an admin form and one typed into a registration form agree
 * about as often as not.
 */
export async function appointCoordinator(input: {
  session: Session;
  villageId: string;
  /** Either identifier — whichever the screen had to hand. */
  email?: string;
  userId?: string;
}): Promise<AppointmentOutcome> {
  const { session, villageId } = input;

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "The database is not configured." };
  }

  if (!isPlatformAdmin(session)) {
    return {
      ok: false,
      error: "Only a platform administrator can appoint a coordinator.",
    };
  }

  const email = input.email?.trim().toLowerCase();

  if (!email && !input.userId) {
    return { ok: false, error: "Name the resident to appoint." };
  }

  const user = await prisma.user.findFirst({
    where: input.userId ? { id: input.userId } : { email },
    select: {
      id: true,
      email: true,
      fullName: true,
      role: true,
      villageId: true,
      verifiedAt: true,
      deletedAt: true,
    },
  });

  if (!user) {
    return {
      ok: false,
      error: `No registered resident with that email${email ? ` (${email})` : ""}.`,
    };
  }

  if (user.deletedAt) {
    return { ok: false, error: `${user.fullName} has closed their account.` };
  }

  if (user.villageId !== villageId) {
    // Deliberately not "they are in <other village>". The administrator is
    // platform-wide and could be told, but the useful half is that this is the
    // wrong screen for it, and naming somebody else's village here would make
    // the queue a directory of who lives where.
    return {
      ok: false,
      error: `${user.fullName} is not a resident of this village.`,
    };
  }

  if (!canApplyForCoordinator(user.role)) {
    // Covers "already a coordinator" and the two roles above it, which this
    // must never quietly demote — see the same guard in the approval path.
    return {
      ok: false,
      error: `${user.fullName} already has coordinator access.`,
    };
  }

  const now = new Date();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      role: "COORDINATOR",
      // Appointing somebody to coordinate a village answers the question
      // `verifiedAt` records. Only filled when empty, so an existing
      // verification keeps its original date and verifier.
      verifiedAt: user.verifiedAt ?? now,
      verifiedById: user.verifiedAt ? undefined : session.user.id,
    },
  });

  await auditRoleChange({
    session,
    villageId,
    action: "village.coordinator_appointed",
    subjectId: user.id,
    before: user.role,
    after: "COORDINATOR",
  });

  await notifySlack(`🛡️ ${user.fullName} appointed coordinator by an administrator`);

  return {
    ok: true,
    userId: user.id,
    fullName: user.fullName,
    message: `${user.fullName} is now a coordinator.`,
  };
}

/**
 * Takes coordinator access away again.
 *
 * Only a `COORDINATOR` is demoted. `MODERATOR` and `ADMIN` are not roles this
 * screen granted and not ones it should quietly take, and neither is reachable
 * from anything in the application today — a demotion that swept them up would
 * be a surprise nobody asked for.
 *
 * They land on `VERIFIED_RESIDENT` when `verifiedAt` is set and `RESIDENT`
 * otherwise. `verifiedAt` records that somebody confirmed this person lives in
 * the village, which does not stop being true when they stop coordinating —
 * dropping everyone to `RESIDENT` flat would silently un-verify a resident as a
 * side effect of an unrelated decision, and it is the column the notification
 * audience and the moderation screens read.
 */
export async function removeCoordinator(input: {
  session: Session;
  villageId: string;
  userId: string;
}): Promise<AppointmentOutcome> {
  const { session, villageId, userId } = input;

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "The database is not configured." };
  }

  if (!isPlatformAdmin(session)) {
    return {
      ok: false,
      error: "Only a platform administrator can remove a coordinator.",
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      fullName: true,
      role: true,
      villageId: true,
      verifiedAt: true,
    },
  });

  if (!user) return { ok: false, error: "That resident no longer exists." };

  if (user.villageId !== villageId) {
    return {
      ok: false,
      error: `${user.fullName} is not a resident of this village.`,
    };
  }

  if (user.role !== "COORDINATOR") {
    return { ok: false, error: `${user.fullName} is not a coordinator.` };
  }

  const demoted = user.verifiedAt ? "VERIFIED_RESIDENT" : "RESIDENT";

  await prisma.user.update({
    where: { id: user.id },
    data: { role: demoted },
  });

  await auditRoleChange({
    session,
    villageId,
    action: "village.coordinator_removed",
    subjectId: user.id,
    before: "COORDINATOR",
    after: demoted,
  });

  return {
    ok: true,
    userId: user.id,
    fullName: user.fullName,
    message: `${user.fullName} no longer coordinates this village.`,
  };
}
