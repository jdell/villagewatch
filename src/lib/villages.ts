import { randomInt } from "node:crypto";
import type { VillageStatus } from "@/generated/prisma/enums";
import type { Session } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_PRIVACY_LEVEL,
  JOIN_CODE_LENGTH,
  canApplyForCoordinator,
  resolvePrivacyLevel,
  type PrivacyLevel,
} from "@/lib/constants";
import { normalizeJoinCode } from "@/lib/validations";

/**
 * Everything about a village: bringing one to life, letting a resident into it,
 * and the handful of columns a screen reads back off it.
 *
 * **Server only** — `node:crypto` is not available in the browser, and this
 * module mints a credential and raises a role. The copy a Client Component needs
 * to explain why a village cannot be joined lives in `src/lib/constants.ts`
 * instead, and `normalizeJoinCode` lives in `src/lib/validations.ts` for the same
 * reason: the invite link is built in the browser and has to normalise a code the
 * same way the join check does.
 *
 * ## There used to be two of these
 *
 * `src/lib/village.ts` — singular — implemented the same village lifecycle again:
 * a second join-code alphabet, a second `activateVillage`, a second
 * `regenerateJoinCode`, plus `suspendVillage` and `saveVillageAdminSettings` that
 * nothing called. Only this module was ever wired up (`/admin/villages`), so the
 * other one was a complete, carefully documented, entirely unreachable copy —
 * and its `checkVillageJoin`, the function that was supposed to be the *only*
 * place a join code is checked, was among the unreachable parts. Both auth routes
 * had hand-rolled comparisons instead, and both let a blank code through.
 *
 * The two are now one. The live half of the singular module — the reads, and the
 * join check — moved here; its duplicate lifecycle went. A rule enforced in two
 * modules is a rule that will one day be enforced in one.
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
export const JOIN_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

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

  // **The code first, on its own, and only then the status.** The two writes go
  // in the order whose half-completed state is the safe one: a `PENDING` village
  // holding an unused code is inert, while an `ACTIVE` village with a null code
  // is one that `checkVillageJoin` lets anybody into — "no code set" reads there
  // as "no code required", which is the escape hatch for rows that predate
  // activation and must not become the outcome of a failed activation. This ran
  // the other way round until the join code was actually enforced, when the
  // window between the two writes stopped being cosmetic.
  const joinCode = village.joinCode ?? (await setUniqueJoinCode(villageId));

  // Conditional on the status just read, so the second of two concurrent
  // activations updates nothing.
  const { count } = await prisma.village.updateMany({
    where: { id: villageId, status: village.status },
    data: { status: "ACTIVE" },
  });

  if (count === 0) {
    return { ok: false, error: "Someone else activated that village first." };
  }

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

// ---------------------------------------------------------------------------
// Joining a village
// ---------------------------------------------------------------------------

/** What the two public invite pages render, and all they are allowed to know. */
export type InviteVillage = {
  id: string;
  name: string;
  slug: string;
  region: string | null;
  status: VillageStatus;
};

/**
 * One village by slug, for `/invite/[slug]` and `/join/[slug]`.
 *
 * **`joinCode` is deliberately not selected.** Both callers are public pages,
 * and a page that looked the code up by slug would hand a village's credential
 * to anybody who could guess a parish name — the slugs are `name-county`, so
 * guessing is the easy case. The code those pages render arrives in the request,
 * from the link a coordinator sent; see `src/lib/invite.ts`.
 *
 * `status` comes back rather than being filtered on, because a `PENDING` parish
 * out of the ONS directory is a real village that is not live yet, and the page
 * says so — a 404 would tell a resident their village does not exist.
 */
export async function findVillageBySlug(
  slug: string,
): Promise<InviteVillage | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    return await prisma.village.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        region: true,
        status: true,
      },
    });
  } catch (cause) {
    console.error("Could not read village %s", slug, cause);
    return null;
  }
}

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
 * the password and Google paths cannot drift.
 *
 * ## The join code is required whenever the village has one
 *
 * Which, after activation, is every live village. **This is the fix, not a
 * restatement.** Both auth routes used to carry their own copy of the comparison,
 * and both copies were guarded by `if (joinCode && !codeMatches)` — so a *wrong*
 * code was refused and a *blank* one was not. Anybody who could see a village in
 * the picker could join it by leaving the field empty, landing as `RESIDENT`:
 * inside the tenant boundary every incident query is scoped by (domain rule 4),
 * on the village map, and in the audience for its push alerts. The code was
 * documented as the credential that decides who gets into a village and was in
 * practice an optional upgrade to `VERIFIED_RESIDENT`.
 *
 * A village that has not been activated has no code, and is refused on `status`
 * before this is ever consulted — so the null branch below is reachable only by
 * rows written before activation existed, which stay joinable rather than being
 * locked out by an upgrade. `activateVillage` mints the code before it flips the
 * status precisely so that branch cannot be reached by anything new.
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
    return {
      ok: true,
      village: { id: village.id, name: village.name },
      verified: false,
    };
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

  return {
    ok: true,
    village: { id: village.id, name: village.name },
    verified: true,
  };
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
// The data controller named on a document leaving the village
// ---------------------------------------------------------------------------

/**
 * The village name and the data controller named in a document leaving it.
 *
 * ## Why this is not a plain `findUnique`
 *
 * `parish_council` arrives with `20260727180000_village_activation`. That
 * migration is applied on the deployed database now, but a fresh clone or a
 * restored copy can still be behind, and being nullable in `schema.prisma` does
 * not help: Prisma names the column in the SELECT list either way, so Postgres
 * rejects the whole statement with `42703` and every read throws. That is what
 * took `/reports` down before the migration ran, rather than anything on the
 * page itself.
 *
 * Caught and retried without the column, the same shape `getVillageChannel` and
 * `getVillageAutoApprove` use for their own columns.
 *
 * ## The degradation is deliberately partial
 *
 * `name` survives, because it titles the report and it has existed since the
 * init migration; only the controller falls back, through `reportController`,
 * to the deployment-wide `DATA_CONTROLLER`. That is a state the product already
 * has an answer for — `/reports` renders an amber warning naming it, and the
 * placeholder is what the footer would have said for a village with the column
 * empty anyway. Returning null here instead would send `/reports` to
 * `<NoVillage />` and tell a coordinator they are not attached to a village,
 * which is both false and unactionable.
 *
 * A second failure is left to propagate. The retry drops the one column that is
 * known to be missing; if the name cannot be read either, the database is down
 * and a report assembled anyway would be a document with no incidents in it,
 * which is worse than an error page.
 */
export async function getVillageController(
  villageId: string,
): Promise<{ name: string; parishCouncil: string | null } | null> {
  try {
    return await prisma.village.findUnique({
      where: { id: villageId },
      select: { name: true, parishCouncil: true },
    });
  } catch (cause) {
    console.error(
      "Could not read parish_council for village %s — falling back to the deployment-wide data controller. Has 20260727180000_village_activation been applied?",
      villageId,
      cause,
    );

    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: { name: true },
    });

    return village ? { name: village.name, parishCouncil: null } : null;
  }
}

// ---------------------------------------------------------------------------
// The parish council, as the village's own coordinator sets it
// ---------------------------------------------------------------------------

/**
 * Whether `villages.parish_council` exists in this database, and what is in it.
 *
 * The distinction is the whole reason this is not a `string | null`. A plain
 * null cannot tell "no council has been named" apart from "this database has no
 * column to name one in". The first is a form waiting to be filled in; the
 * second is a form that will throw the moment somebody presses Save. The
 * dashboard renders them differently because they are different problems with
 * different fixes, and only one of them belongs to the coordinator.
 */
export type ParishCouncilSetting =
  | { available: true; value: string | null }
  | { available: false; value: null };

/**
 * Postgres `42703` — undefined column — however Prisma happens to surface it.
 *
 * Three shapes, because the column is in `schema.prisma` and missing from the
 * database, which is a state Prisma reports differently depending on how the
 * statement was built. `P2022` is its own typed code for exactly this; the
 * driver adapter can also pass the raw SQLSTATE straight through; and the
 * message is the last resort. Matching narrowly on purpose — a broad catch here
 * would swallow a genuinely broken database and tell a coordinator to go and
 * find an administrator about a migration when the real problem is that nothing
 * can reach Postgres at all.
 */
function isMissingParishCouncilColumn(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;

  const code = (cause as { code?: unknown }).code;
  if (code === "P2022" || code === "42703") return true;

  const message = (cause as { message?: unknown }).message;
  return typeof message === "string" && message.includes("parish_council");
}

/** What the dashboard's parish council field should show. */
export async function getVillageParishCouncil(
  villageId: string,
): Promise<ParishCouncilSetting> {
  try {
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: { parishCouncil: true },
    });

    return { available: true, value: village?.parishCouncil ?? null };
  } catch (cause) {
    if (!isMissingParishCouncilColumn(cause)) throw cause;

    console.error(
      "villages.parish_council is missing — has 20260727180000_village_activation been applied?",
      cause,
    );

    return { available: false, value: null };
  }
}

export type ParishCouncilWrite =
  | { ok: true }
  | { ok: false; reason: "unmigrated" | "failed" };

/**
 * Writes the village's data controller.
 *
 * Returns rather than throws, and distinguishes the two failures, because they
 * read completely differently on screen. "Try again" is a lie when the column
 * does not exist — the coordinator can press that button until the migration is
 * applied and it will never work — so the action turns `unmigrated` into a
 * message naming what has to happen and who has to do it.
 */
export async function setVillageParishCouncil(
  villageId: string,
  parishCouncil: string | null,
): Promise<ParishCouncilWrite> {
  try {
    await prisma.village.update({
      where: { id: villageId },
      data: { parishCouncil },
    });

    return { ok: true };
  } catch (cause) {
    if (isMissingParishCouncilColumn(cause)) {
      console.error(
        "Could not save parish_council for village %s — the column does not exist. Apply 20260727180000_village_activation.",
        villageId,
        cause,
      );
      return { ok: false, reason: "unmigrated" };
    }

    console.error(
      "Could not save the parish council for village %s",
      villageId,
      cause,
    );
    return { ok: false, reason: "failed" };
  }
}

// ---------------------------------------------------------------------------
// The face redaction level, as the village's own coordinator sets it
// ---------------------------------------------------------------------------

/**
 * Postgres `42703` for `villages.privacy_level`.
 *
 * Same three shapes and the same narrow matching as
 * `isMissingParishCouncilColumn` above — see its comment for why a broad catch
 * here would be worse than useless.
 */
function isMissingPrivacyLevelColumn(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;

  const code = (cause as { code?: unknown }).code;
  if (code === "P2022" || code === "42703") return true;

  const message = (cause as { message?: unknown }).message;
  return typeof message === "string" && message.includes("privacy_level");
}

/**
 * Whether `villages.privacy_level` exists in this database, and what is in it.
 *
 * The same two-part answer `getVillageParishCouncil` returns, and for the same
 * reason. The difference is what `value` is when the column is missing. There it
 * is `null` and the footer falls back; here it is `DEFAULT_PRIVACY_LEVEL`,
 * because the uploader has to be told *something* and the honest something is
 * what an unmigrated deployment actually does — the standard blur, for every
 * village, with no way to change it. Never `null`: this value ends up as a
 * redaction mode, and there is no state in which the right answer is to cover
 * nothing.
 */
export type PrivacyLevelSetting = {
  /** False when the column is missing from this database. */
  available: boolean;
  value: PrivacyLevel;
};

/** What the uploader applies, and what the dashboard's selector shows. */
export async function getVillagePrivacyLevel(
  villageId: string,
): Promise<PrivacyLevelSetting> {
  if (!process.env.DATABASE_URL) {
    return { available: false, value: DEFAULT_PRIVACY_LEVEL };
  }

  try {
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: { privacyLevel: true },
    });

    // `resolvePrivacyLevel` rather than a cast. The column is a `String`, so a
    // value typed into psql — or left behind by a level a later release removed
    // — reaches here as something this build has no mapping for, and the
    // fallback has to be a level rather than a crash in the report wizard.
    return { available: true, value: resolvePrivacyLevel(village?.privacyLevel) };
  } catch (cause) {
    if (!isMissingPrivacyLevelColumn(cause)) throw cause;

    console.error(
      "villages.privacy_level is missing — has 20260728120000_village_privacy_level been applied?",
      cause,
    );

    return { available: false, value: DEFAULT_PRIVACY_LEVEL };
  }
}

export type PrivacyLevelWrite =
  | { ok: true }
  | { ok: false; reason: "unmigrated" | "failed" };

/**
 * Writes the village's face redaction level.
 *
 * Returns rather than throws and distinguishes the two failures, for the reason
 * `setVillageParishCouncil` does: "try again" is a lie when the column does not
 * exist, and the coordinator could press Save until somebody runs a migration.
 */
export async function setVillagePrivacyLevel(
  villageId: string,
  privacyLevel: PrivacyLevel,
): Promise<PrivacyLevelWrite> {
  try {
    await prisma.village.update({
      where: { id: villageId },
      data: { privacyLevel },
    });

    return { ok: true };
  } catch (cause) {
    if (isMissingPrivacyLevelColumn(cause)) {
      console.error(
        "Could not save privacy_level for village %s — the column does not exist. Apply 20260728120000_village_privacy_level.",
        villageId,
        cause,
      );
      return { ok: false, reason: "unmigrated" };
    }

    console.error(
      "Could not save the privacy level for village %s",
      villageId,
      cause,
    );
    return { ok: false, reason: "failed" };
  }
}
