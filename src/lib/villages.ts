import { randomInt } from "node:crypto";
import type { Session } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canApplyForCoordinator } from "@/lib/constants";

/**
 * Bringing a village to life. **Server only** — `node:crypto` is not available
 * in the browser, and this module mints a credential and raises a role.
 *
 * ## The gap this closes
 *
 * `prisma/seed-villages.ts` seeds 10,670 parishes from the ONS directory, every
 * one of them `PENDING` with no join code. Until this module existed nothing in
 * the application ever wrote `Village.status` — `prisma/seed.ts` hardcodes
 * `ACTIVE` for its single placeholder and every other occurrence in `src/` is a
 * *read* filter. So a seeded parish was `PENDING` forever, invisible in the
 * pickers on `/register` and `/welcome`, and the only way to promote one was an
 * `UPDATE` typed into psql.
 *
 * That left a genuine chicken and egg. `src/lib/coordinator-requests.ts` can
 * raise somebody to `COORDINATOR`, but it starts from a resident who is already
 * *in* the village — and nobody could be in a village that could not be joined,
 * because joining wants a join code a seeded village did not have. The first
 * step was missing, not the last.
 *
 * ## Two steps, not one
 *
 * The obvious shape is "activate a village and appoint its first coordinator"
 * as a single operation. It cannot be, and the reason is worth stating: a
 * `User` row is created by Supabase Auth signing somebody up, so the first
 * coordinator of a cold village usually **does not have one yet**. There is
 * nobody to appoint until they have registered, and they cannot register until
 * the village is active and has a code. So:
 *
 *   1. `activateVillage` — status to `ACTIVE`, mint a join code. The village is
 *      now in the picker and joinable.
 *   2. the prospective coordinator registers with that code, which makes them a
 *      `VERIFIED_RESIDENT`.
 *   3. `appointCoordinator` — raise them, by email.
 *
 * Step 3 is the same promotion `decideCoordinatorRequest` performs, and it
 * deliberately shares that function's two rules: never demote somebody who has
 * since gained more access, and fill `verifiedAt` only when it is empty.
 *
 * ## Everything here is platform-admin only
 *
 * `isPlatformAdmin()` is re-checked inside each function rather than trusted
 * from the page that called it, for the reason `coordinator-requests.ts` gives:
 * a permission check belongs next to the privilege it guards, not only at the
 * doors in front of it. These functions activate a tenant and hand somebody the
 * ability to read their neighbours' verbatim reports.
 */

/**
 * The alphabet a join code is drawn from.
 *
 * No `I`, `L`, `O`, `0` or `1`. A join code is read off a WhatsApp message, a
 * parish newsletter or a note through a door and typed back in by somebody who
 * did not choose it, so the pairs that are indistinguishable in most fonts are
 * simply not in the set. Both auth routes compare with `.toUpperCase()`, so
 * upper case only is the honest representation of what is actually checked.
 */
const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Matches the seed's `VILLAGE1`, and well inside the 24-char schema cap. */
const JOIN_CODE_LENGTH = 8;

/** Collisions are vanishingly unlikely; the column is `@unique` regardless. */
const JOIN_CODE_ATTEMPTS = 5;

export type VillageOutcome =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * A fresh join code.
 *
 * `randomInt` from `node:crypto`, not `Math.random`. This is a credential —
 * it is what turns a stranger with the village's name into a
 * `VERIFIED_RESIDENT` — and a predictable one would let somebody guess their
 * way into a village's reports.
 */
function generateJoinCode(): string {
  let code = "";

  for (let i = 0; i < JOIN_CODE_LENGTH; i += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }

  return code;
}

/**
 * Writes a new join code, retrying past the `@unique` collision.
 *
 * The retry is on the constraint rather than on a read-then-write, because two
 * administrators activating two villages in the same second would both see the
 * code as free.
 */
async function setUniqueJoinCode(villageId: string): Promise<string> {
  for (let attempt = 0; attempt < JOIN_CODE_ATTEMPTS; attempt += 1) {
    const joinCode = generateJoinCode();

    try {
      await prisma.village.update({
        where: { id: villageId },
        data: { joinCode },
      });

      return joinCode;
    } catch (cause) {
      const isClash =
        typeof cause === "object" &&
        cause !== null &&
        "code" in cause &&
        (cause as { code?: string }).code === "P2002";

      if (!isClash || attempt === JOIN_CODE_ATTEMPTS - 1) throw cause;
    }
  }

  throw new Error("Could not mint a unique join code");
}

/**
 * Puts a village into service: `ACTIVE`, with a join code.
 *
 * Only `ACTIVE` villages reach the picker on `/register` and `/welcome`, and
 * both auth routes re-check the status server-side — so this is the single
 * switch that makes a parish joinable.
 *
 * A village that already has a code keeps it. Activation and rotation are
 * different decisions and rotating on activation would invalidate a code that
 * may already be on a poster; `regenerateJoinCode` is the deliberate way to
 * change one.
 */
export async function activateVillage(input: {
  session: Session;
  villageId: string;
}): Promise<VillageOutcome & { joinCode?: string }> {
  const { session, villageId } = input;

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "The database is not configured." };
  }

  if (!isPlatformAdmin(session)) {
    return {
      ok: false,
      error: "Only a platform administrator can activate a village.",
    };
  }

  const village = await prisma.village.findUnique({
    where: { id: villageId },
    select: { id: true, name: true, status: true, joinCode: true },
  });

  if (!village) return { ok: false, error: "That village no longer exists." };

  if (village.status === "ACTIVE" && village.joinCode) {
    return { ok: false, error: `${village.name} is already active.` };
  }

  // Conditional on the status just read, so the second of two concurrent
  // activations updates nothing and never mints a second code.
  const { count } = await prisma.village.updateMany({
    where: { id: villageId, status: village.status },
    data: { status: "ACTIVE" },
  });

  if (count === 0) {
    return { ok: false, error: "Someone else activated that village first." };
  }

  const joinCode = village.joinCode ?? (await setUniqueJoinCode(villageId));

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorEmail: session.user.email,
      // `"PLATFORM_ADMIN"` rather than the actor's `User.role`, for the reason
      // `decideCoordinatorRequest` gives: the authority here is membership of
      // ADMIN_EMAILS, and an administrator's profile may say RESIDENT or may
      // not exist at all.
      actorRole: "PLATFORM_ADMIN",
      villageId,
      action: "village.activated",
      entityType: "village",
      entityId: villageId,
      before: { status: village.status, hadJoinCode: Boolean(village.joinCode) },
      // **Never the code itself.** The trail is append-only (domain rule 7) and
      // every coordinator in the village can read it at `/dashboard/audit`, so
      // a code written here outlives every rotation of it. `rls_policies.sql`
      // withholds `join_code` from the anon grant for the same reason.
      after: { status: "ACTIVE", hasJoinCode: true },
    },
  });

  return {
    ok: true,
    joinCode,
    message: `${village.name} is active. Its join code is ${joinCode}.`,
  };
}

/**
 * Replaces a village's join code.
 *
 * The old one stops working immediately, which is the point — a code on a
 * poster that has been photographed, or forwarded out of the village WhatsApp
 * group, is a way for a stranger to become a `VERIFIED_RESIDENT`. Residents
 * already in the village are unaffected: the code verifies at registration and
 * is never checked again.
 */
export async function regenerateJoinCode(input: {
  session: Session;
  villageId: string;
}): Promise<VillageOutcome & { joinCode?: string }> {
  const { session, villageId } = input;

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "The database is not configured." };
  }

  if (!isPlatformAdmin(session)) {
    return {
      ok: false,
      error: "Only a platform administrator can change a join code.",
    };
  }

  const village = await prisma.village.findUnique({
    where: { id: villageId },
    select: { name: true },
  });

  if (!village) return { ok: false, error: "That village no longer exists." };

  const joinCode = await setUniqueJoinCode(villageId);

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: "PLATFORM_ADMIN",
      villageId,
      action: "village.join_code_reset",
      entityType: "village",
      entityId: villageId,
      // Neither the old code nor the new one. See `activateVillage`.
      after: { rotated: true },
    },
  });

  return {
    ok: true,
    joinCode,
    message: `New join code for ${village.name}: ${joinCode}. The old one no longer works.`,
  };
}

/**
 * Makes a registered resident the village's coordinator.
 *
 * By email, because that is what an administrator has — they are appointing
 * somebody who wrote to them, not picking out of a list they have any reason to
 * be able to see.
 *
 * **It refuses to move somebody between villages.** A resident already in
 * another parish is an error rather than a silent transfer: their reports,
 * their home location and their notification radius all belong to the village
 * they joined, and quietly relocating them because an administrator typed the
 * wrong address is not a recoverable mistake.
 */
export async function appointCoordinator(input: {
  session: Session;
  villageId: string;
  email: string;
}): Promise<VillageOutcome> {
  const { session, villageId, email } = input;

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "The database is not configured." };
  }

  if (!isPlatformAdmin(session)) {
    return {
      ok: false,
      error: "Only a platform administrator can appoint a coordinator.",
    };
  }

  const village = await prisma.village.findUnique({
    where: { id: villageId },
    select: { name: true, status: true, joinCode: true },
  });

  if (!village) return { ok: false, error: "That village no longer exists." };

  const user = await prisma.user.findFirst({
    // Addresses are stored as the resident typed them and an administrator is
    // retyping one from an email; a case-sensitive match would fail on a
    // capitalised first letter and read as "they have not registered".
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      villageId: true,
      verifiedAt: true,
      deletedAt: true,
    },
  });

  if (!user || user.deletedAt) {
    return {
      ok: false,
      error: `No account for ${email}. They need to register first — give them the join code for ${village.name}, then appoint them.`,
    };
  }

  if (user.villageId && user.villageId !== villageId) {
    return {
      ok: false,
      error: `${user.fullName} already belongs to another village. Appointing them here would move them, so this refuses — check the address.`,
    };
  }

  // Same rule as `decideCoordinatorRequest`: writing COORDINATOR
  // unconditionally would be a demotion for somebody who has since become a
  // MODERATOR or an ADMIN by another route.
  const promote = canApplyForCoordinator(user.role);
  const now = new Date();

  await prisma.user.update({
    where: { id: user.id },
    data: {
      villageId,
      role: promote ? "COORDINATOR" : user.role,
      // Appointing somebody to coordinate a village answers the question
      // `verifiedAt` records. An existing verification keeps its date.
      verifiedAt: user.verifiedAt ?? now,
      verifiedById: user.verifiedAt ? undefined : session.user.id,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: "PLATFORM_ADMIN",
      villageId,
      action: "village.coordinator_appointed",
      entityType: "User",
      entityId: user.id,
      before: { role: user.role, villageId: user.villageId },
      after: {
        role: promote ? "COORDINATOR" : user.role,
        villageId,
        appointeeEmail: user.email,
      },
    },
  });

  return {
    ok: true,
    message: promote
      ? `${user.fullName} is now a coordinator of ${village.name}.`
      : `${user.fullName} is attached to ${village.name}. Their role was left as ${user.role} — it already carries coordinator access.`,
  };
}
