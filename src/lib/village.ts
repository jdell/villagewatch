import { randomInt } from "node:crypto";
import type { Prisma } from "@/generated/prisma/client";
import type { VillageStatus } from "@/generated/prisma/enums";
import type { Session } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { appointCoordinator } from "@/lib/coordinator-requests";
import { notifySlack } from "@/lib/slack";
import { JOIN_CODE_LENGTH } from "@/lib/constants";

/**
 * The village lifecycle: seeded directory entry → live village.
 *
 * **Server only.** `node:crypto` is imported at the top of this module, so a
 * Client Component that reaches for anything here breaks the build rather than
 * shipping a code generator to the browser. The copy a form needs to explain why
 * a village cannot be joined lives in `src/lib/constants.ts` instead.
 *
 * ## What this closes
 *
 * `prisma/seed-villages.ts` seeds 10,670 parishes as `PENDING` with no join
 * code, and until now nothing in the repo could move one out of that state:
 * `prisma/seed.ts` hardcoded `ACTIVE` for its own placeholder and every other
 * `status: "ACTIVE"` in `src/` was a read filter. So a seeded parish was
 * `PENDING` forever, the only promotion path was an `UPDATE` typed into psql,
 * and a report filed in such a village would sit in `PENDING_REVIEW` where no
 * coordinator existed to see it (domain rule 6). Coordinator access requests
 * closed the second half of this — they promote a resident who is *already* in
 * a village — and this module is the first half.
 *
 * ## The three rules that shape everything below
 *
 * 1. **A code is minted before the status flips, never after.** An `ACTIVE`
 *    village with a null `joinCode` accepts anybody who can find it in the
 *    picker, because "no code set" is what the auth routes read as "no code
 *    required". A `PENDING` village holding an unused code is inert. So the two
 *    writes go in the order whose half-completed state is the safe one.
 * 2. **Every transition is guarded on the status just read.** `updateMany` with
 *    the previous status in the predicate, so two administrators clicking
 *    Activate at the same time produce one activation and one "already active"
 *    rather than two audit rows claiming the same thing — the same shape
 *    `decideCoordinatorRequest` uses.
 * 3. **Every transition writes an `AuditLog` row.** Activating a village opens
 *    registration to it; suspending it closes it; regenerating the code locks
 *    out everyone holding the old one. None of those is recoverable from the
 *    village row afterwards, which only ever shows the current state.
 */

/**
 * The alphabet a join code is drawn from: uppercase alphanumerics minus the
 * four that collide when read aloud or off a noticeboard.
 *
 * `0`/`O` and `1`/`I`/`L` are dropped. The code is transcribed by hand from a
 * parish newsletter, a WhatsApp message or a clerk reading it down the phone, so
 * a character set that cannot be misheard is worth more than the 0.4 bits each
 * one costs. 31 characters over `JOIN_CODE_LENGTH` positions is ~29 bits — not a
 * secret worth attacking, and not meant to be one: the code proves somebody was
 * given it by the village, and `POST /api/incidents` is rate limited regardless.
 */
export const JOIN_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * How many codes to try before giving up on a collision.
 *
 * `Village.joinCode` is `@unique`, so a duplicate is a P2002 rather than two
 * villages sharing a code. At 31^6 the birthday odds against a few thousand
 * villages are negligible; five attempts is the belt to that braces, and
 * failing loudly after them beats an activation that silently left the column
 * null.
 */
const JOIN_CODE_ATTEMPTS = 5;

/**
 * A fresh join code. Uppercase, unambiguous, `JOIN_CODE_LENGTH` characters.
 *
 * `randomInt` from `node:crypto`, not `Math.random()`: this is the credential
 * that decides who joins a village, and `randomInt` rejection-samples so the
 * four characters that do not divide evenly into 256 are not quietly twice as
 * likely as the rest. Uniqueness is not this function's job — see `mintJoinCode`.
 */
export function generateJoinCode(): string {
  let code = "";
  for (let index = 0; index < JOIN_CODE_LENGTH; index += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(0, JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * What a resident typed, in the shape the column holds.
 *
 * Case-folded, and spaces and hyphens dropped — a code read off a newsletter
 * arrives as `oak 7x2` or `OAK-7X2` about as often as it arrives clean, and
 * rejecting those teaches residents that the code they were given is wrong.
 * Applied to both sides of the comparison in `checkVillageJoin`, because rows
 * set by hand in psql before this module existed are not guaranteed to be
 * normalised either.
 */
export function normalizeJoinCode(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/** Prisma's unique-constraint failure, without importing the error class. */
function isUniqueViolation(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    (cause as { code?: unknown }).code === "P2002"
  );
}

/**
 * Writes a fresh, unique join code onto one village and returns it.
 *
 * Deliberately not part of the status update. It runs first and on its own, so
 * that a failure anywhere in an activation leaves a `PENDING` village holding an
 * unused code rather than an `ACTIVE` one holding none — see rule 1 above.
 */
async function mintJoinCode(villageId: string): Promise<string> {
  for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt += 1) {
    const code = generateJoinCode();

    try {
      await prisma.village.update({
        where: { id: villageId },
        data: { joinCode: code },
      });
      return code;
    } catch (cause) {
      // Only a collision is worth another draw. Anything else — the village was
      // deleted, the connection died — is the caller's problem, not a retry.
      if (!isUniqueViolation(cause)) throw cause;
    }
  }

  throw new Error(
    `Could not mint a unique join code for village ${villageId} in ${JOIN_CODE_ATTEMPTS} attempts`,
  );
}

/**
 * The actor id for an audit row written by a platform administrator.
 *
 * `AuditLog.actorId` is a foreign key to `users`, and an administrator is an
 * address in `ADMIN_EMAILS` rather than a row — somebody who has never joined a
 * village can open `/admin` and act, which is the whole point of deciding the
 * gate on the JWT. Writing their auth id into the column would fail the FK.
 * `actorEmail` and `actorRole` are denormalised precisely so a null here costs
 * the trail nothing.
 */
function actorIdFor(session: Session): string | null {
  return session.profile ? session.user.id : null;
}

type AuditInput = {
  session: Session;
  villageId: string;
  action: string;
  /**
   * `Prisma.InputJsonValue` rather than `Record<string, unknown>`, because
   * `AuditLog.before` and `.after` are `Json?` columns and Prisma's input type
   * for those is a recursive union it will not accept an `unknown` value into.
   * Every caller in this module already passes an object literal of primitives,
   * so nothing changes at a call site — it is the difference between the
   * signature describing the column and the signature describing the intent.
   */
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
};

/**
 * One trail row for one administrative act.
 *
 * Never throws. The village change is already committed by the time this runs,
 * and telling an administrator their activation failed because a log write did
 * would be false — the same contract `saveAutoApproveAction` uses.
 */
async function audit({ session, villageId, action, before, after }: AuditInput) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorIdFor(session),
        actorEmail: session.user.email ?? null,
        // `"PLATFORM_ADMIN"` rather than the actor's `User.role`, matching
        // `decideCoordinatorRequest`. The authority for every action in this
        // module is `ADMIN_EMAILS`, and an administrator's profile may well say
        // `RESIDENT` — which in the trail would read as a resident activating a
        // village, the exact escalation this record exists to rule out.
        actorRole: "PLATFORM_ADMIN",
        villageId,
        action,
        entityType: "village",
        entityId: villageId,
        before,
        after,
      },
    });
  } catch (cause) {
    console.error("Could not audit %s for village %s", action, villageId, cause);
  }
}

// ---------------------------------------------------------------------------
// Joining a village
// ---------------------------------------------------------------------------

export type VillageJoinCheck =
  | {
      ok: true;
      village: { id: string; name: string };
      /**
       * Whether the resident produced a correct code, and therefore whether they
       * land as `VERIFIED_RESIDENT`. True for every village that has a code,
       * because the code is required when one is set — it is false only for the
       * legacy shape below, where there is nothing to produce.
       */
      verified: boolean;
    }
  | { ok: false; error: string; field: "villageId" | "joinCode" };

/**
 * Whether this village will accept this resident, and with what standing.
 *
 * Shared by `POST /api/auth/register` and `POST /api/auth/complete-profile` so
 * the password and Google paths cannot drift — they had two hand-rolled copies
 * of the code comparison, and a rule that has to be enforced twice is a rule
 * that will one day be enforced once.
 *
 * **The join code is required whenever the village has one**, which after
 * activation is every live village. That is the change: it used to be an
 * optional shortcut to `VERIFIED_RESIDENT`, so anybody who could see a village
 * in the picker could join it by leaving the field blank. A village that has
 * not been activated has no code, and is refused on `status` before this is ever
 * consulted — so the null case below is only reachable by the rows
 * `prisma/seed.ts` and psql created before activation existed, which stay
 * joinable rather than being locked out by an upgrade.
 */
export async function checkVillageJoin(input: {
  villageId: string;
  joinCode?: string;
}): Promise<VillageJoinCheck> {
  const village = await prisma.village.findUnique({
    where: { id: input.villageId },
    select: { id: true, name: true, status: true, joinCode: true },
  });

  if (!village) {
    return {
      ok: false,
      error: "That village could not be found",
      field: "villageId",
    };
  }

  if (village.status !== "ACTIVE") {
    return {
      ok: false,
      error: VILLAGE_JOIN_REFUSALS[village.status],
      field: "villageId",
    };
  }

  if (!village.joinCode) {
    // No code set, so none can be demanded. Pre-activation rows only.
    return { ok: true, village: { id: village.id, name: village.name }, verified: false };
  }

  const supplied = input.joinCode ? normalizeJoinCode(input.joinCode) : "";

  if (!supplied) {
    return {
      ok: false,
      error: "This village needs a join code",
      field: "joinCode",
    };
  }

  if (supplied !== normalizeJoinCode(village.joinCode)) {
    return {
      ok: false,
      error: "That join code is not valid for this village",
      field: "joinCode",
    };
  }

  return { ok: true, village: { id: village.id, name: village.name }, verified: true };
}

/**
 * Why a village in each non-`ACTIVE` state is refusing registrations.
 *
 * Server-side copy, addressed to the resident who just chose it. The client has
 * its own set in `constants.ts` for the message it shows before submitting;
 * these are what a hand-crafted POST gets back, and they say the same thing.
 */
const VILLAGE_JOIN_REFUSALS = {
  PENDING: "This village is not yet active. Contact your parish council.",
  SUSPENDED: "Registration is temporarily closed for this village.",
  ARCHIVED: "This village is no longer on VillageWatch.",
  ACTIVE: "",
} satisfies Record<VillageStatus, string>;

// ---------------------------------------------------------------------------
// Administration
// ---------------------------------------------------------------------------

export type VillageOutcome =
  | { ok: true; message: string; joinCode?: string }
  | { ok: false; error: string };

/** Every administrative entry point re-checks the gate next to its write. */
function refuseNonAdmin(session: Session): VillageOutcome | null {
  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "The database is not configured." };
  }
  if (!isPlatformAdmin(session)) {
    return {
      ok: false,
      error: "Only a platform administrator can manage villages.",
    };
  }
  return null;
}

/**
 * Takes a village live: mints its join code and opens registration.
 *
 * Optionally appoints the first coordinator in the same act. That is the
 * bootstrap problem this whole module exists for — a coordinator application
 * has to come *from* a resident of the village, so the very first village has
 * nobody who can file one. When the email matches somebody already registered
 * there, they are promoted; when it does not, the activation still succeeds and
 * the message tells the administrator to send the join code to the parish
 * council contact, who registers and then applies through the existing queue.
 * Refusing to activate over an unmatched email would block the common case,
 * which is a village activated before a single resident has signed up.
 */
export async function activateVillage(input: {
  session: Session;
  villageId: string;
  coordinatorEmail?: string;
}): Promise<VillageOutcome> {
  const refusal = refuseNonAdmin(input.session);
  if (refusal) return refusal;

  const village = await prisma.village.findUnique({
    where: { id: input.villageId },
    select: { id: true, name: true, status: true, joinCode: true },
  });

  if (!village) return { ok: false, error: "That village no longer exists." };

  if (village.status === "ACTIVE") {
    return { ok: false, error: `${village.name} is already active.` };
  }

  if (village.status === "ARCHIVED") {
    return {
      ok: false,
      error: `${village.name} is archived. Archived villages are not reactivated from here.`,
    };
  }

  // The code first, on its own, and only then the status — see rule 1. A
  // suspended village keeps the code it already had, so residents holding it
  // are not locked out by an administrator toggling the status twice.
  const joinCode = village.joinCode ?? (await mintJoinCode(village.id));
  const minted = !village.joinCode;

  const { count } = await prisma.village.updateMany({
    where: { id: village.id, status: village.status },
    data: { status: "ACTIVE" },
  });

  if (count === 0) {
    return { ok: false, error: "Someone else changed that village first." };
  }

  if (minted) {
    await audit({
      session: input.session,
      villageId: village.id,
      action: "village.join_code_generated",
      // Never the code itself. Every coordinator in the village can read
      // `/dashboard/audit`, and a credential in an append-only trail cannot be
      // taken back out of it — `AuditLog` has no delete path by design.
      after: { minted: true, reason: "activation" },
    });
  }

  await audit({
    session: input.session,
    villageId: village.id,
    action: "village.activated",
    before: { status: village.status },
    after: { status: "ACTIVE", joinCodeMinted: minted },
  });

  await notifySlack(`🏘️ Village activated: ${village.name}`);

  // The appointment is a separate act with its own audit row and its own
  // failure mode, and it runs after the village is live: promoting somebody to
  // coordinate a village that then failed to activate would be the wrong order
  // to leave half-done.
  let appointment = "";
  if (input.coordinatorEmail?.trim()) {
    const result = await appointCoordinator({
      session: input.session,
      villageId: village.id,
      email: input.coordinatorEmail,
    });

    appointment = result.ok
      ? ` ${result.message}`
      : ` ${result.error} Send them the join code — they can register and apply for coordinator access.`;
  }

  return {
    ok: true,
    joinCode,
    message: `${village.name} is live. Join code ${joinCode}.${appointment}`,
  };
}

/** Closes registration without touching anything already in the village. */
export async function suspendVillage(input: {
  session: Session;
  villageId: string;
}): Promise<VillageOutcome> {
  const refusal = refuseNonAdmin(input.session);
  if (refusal) return refusal;

  const village = await prisma.village.findUnique({
    where: { id: input.villageId },
    select: { id: true, name: true, status: true },
  });

  if (!village) return { ok: false, error: "That village no longer exists." };

  if (village.status !== "ACTIVE") {
    return { ok: false, error: `${village.name} is not active.` };
  }

  const { count } = await prisma.village.updateMany({
    where: { id: village.id, status: "ACTIVE" },
    data: { status: "SUSPENDED" },
  });

  if (count === 0) {
    return { ok: false, error: "Someone else changed that village first." };
  }

  await audit({
    session: input.session,
    villageId: village.id,
    action: "village.suspended",
    before: { status: "ACTIVE" },
    after: { status: "SUSPENDED" },
  });

  return {
    ok: true,
    // Said plainly, because it is the thing an administrator reaching for this
    // button is most likely to have assumed otherwise: suspension is a door, not
    // a shutdown. Residents keep their accounts, the map keeps working, and
    // reports carry on being filed and moderated.
    message: `${village.name} is suspended. New registrations are closed; existing residents are unaffected.`,
  };
}

/** Reopens registration for a suspended village. */
export async function reactivateVillage(input: {
  session: Session;
  villageId: string;
}): Promise<VillageOutcome> {
  const refusal = refuseNonAdmin(input.session);
  if (refusal) return refusal;

  const village = await prisma.village.findUnique({
    where: { id: input.villageId },
    select: { id: true, name: true, status: true, joinCode: true },
  });

  if (!village) return { ok: false, error: "That village no longer exists." };

  if (village.status !== "SUSPENDED") {
    return { ok: false, error: `${village.name} is not suspended.` };
  }

  // Ordinarily the code survived the suspension. If it did not — a row set by
  // hand, an activation that failed between its two writes — mint one now, for
  // the same reason activation does: an `ACTIVE` village with a null code is
  // one anybody can join.
  const joinCode = village.joinCode ?? (await mintJoinCode(village.id));

  const { count } = await prisma.village.updateMany({
    where: { id: village.id, status: "SUSPENDED" },
    data: { status: "ACTIVE" },
  });

  if (count === 0) {
    return { ok: false, error: "Someone else changed that village first." };
  }

  await audit({
    session: input.session,
    villageId: village.id,
    action: "village.activated",
    before: { status: "SUSPENDED" },
    after: { status: "ACTIVE", joinCodeMinted: !village.joinCode },
  });

  return {
    ok: true,
    joinCode,
    message: `${village.name} is accepting registrations again.`,
  };
}

/**
 * Replaces the join code.
 *
 * The consequence is worth stating where somebody clicking the button will read
 * it, which is why the screen says it too: everybody holding the old code is
 * locked out, including residents part-way through registering. It is the right
 * move after a code leaks onto a public noticeboard and the wrong one as
 * routine housekeeping.
 */
export async function regenerateJoinCode(input: {
  session: Session;
  villageId: string;
}): Promise<VillageOutcome> {
  const refusal = refuseNonAdmin(input.session);
  if (refusal) return refusal;

  const village = await prisma.village.findUnique({
    where: { id: input.villageId },
    select: { id: true, name: true, joinCode: true },
  });

  if (!village) return { ok: false, error: "That village no longer exists." };

  const joinCode = await mintJoinCode(village.id);

  await audit({
    session: input.session,
    villageId: village.id,
    action: "village.join_code_generated",
    // `had` rather than the previous code: knowing one existed is what makes
    // the row readable, and the old code is still a credential — it is what
    // every resident registered under, and the trail cannot be redacted later.
    before: { had: Boolean(village.joinCode) },
    after: { minted: true, reason: "regenerated" },
  });

  return {
    ok: true,
    joinCode,
    message: `New join code for ${village.name}: ${joinCode}. The old one no longer works.`,
  };
}

/**
 * The village settings an administrator owns.
 *
 * `parishCouncil` is the data controller, which is a platform-level fact about
 * who is answerable for the village's data rather than a preference its
 * coordinator gets to set. `autoApprove` and the channel link are also on
 * `/dashboard`, where the village's own coordinator sets them; both are here as
 * well because an administrator activating a village on the phone to a parish
 * clerk should not have to talk them through finding the dashboard first.
 *
 * The two settings that overlap keep writing the same audit actions the
 * dashboard writes — `village.auto_approve_changed` and `village.channel_update`
 * — so the trail reads as one history of the setting rather than two histories
 * split by who happened to change it.
 */
export async function saveVillageAdminSettings(input: {
  session: Session;
  villageId: string;
  parishCouncil: string | null;
  autoApprove: boolean;
  whatsappChannelUrl: string | null;
  whatsappChannelId: string | null;
}): Promise<VillageOutcome> {
  const refusal = refuseNonAdmin(input.session);
  if (refusal) return refusal;

  const before = await prisma.village.findUnique({
    where: { id: input.villageId },
    select: {
      name: true,
      parishCouncil: true,
      autoApprove: true,
      whatsappChannelUrl: true,
      whatsappChannelId: true,
    },
  });

  if (!before) return { ok: false, error: "That village no longer exists." };

  await prisma.village.update({
    where: { id: input.villageId },
    data: {
      parishCouncil: input.parishCouncil,
      autoApprove: input.autoApprove,
      whatsappChannelUrl: input.whatsappChannelUrl,
      whatsappChannelId: input.whatsappChannelId,
    },
  });

  if (before.autoApprove !== input.autoApprove) {
    await audit({
      session: input.session,
      villageId: input.villageId,
      action: "village.auto_approve_changed",
      before: { autoApprove: before.autoApprove },
      after: { autoApprove: input.autoApprove },
    });
  }

  if (before.whatsappChannelId !== input.whatsappChannelId) {
    await audit({
      session: input.session,
      villageId: input.villageId,
      action: "village.channel_update",
      before: { channelId: before.whatsappChannelId },
      after: { channelId: input.whatsappChannelId },
    });
  }

  return { ok: true, message: `${before.name} updated.` };
}
