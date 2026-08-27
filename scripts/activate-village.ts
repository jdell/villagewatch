import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Brings one village into service from a terminal: `ACTIVE`, with a join code,
 * and optionally with its first coordinator appointed.
 *
 * Run it with `npm run db:activate-village -- --slug histon-cambridgeshire
 * --admin you@example.uk`. **It prints and changes nothing by default** — read
 * the report, then re-run with `--confirm`.
 *
 * ## Why this exists when `/admin/villages` already does it
 *
 * Because of the bootstrap, and it is the same bootstrap `ADMIN_EMAILS` exists
 * for. Activating the *first* village through the screen needs a browser, a
 * signed-in session, `ADMIN_EMAILS` set on the deployment **and** a redeploy for
 * it to take effect — four things, of which the last is the one that turns a
 * five-minute operational step into a deploy cycle. Every one of the 270 seeded
 * Cambridgeshire parishes has been `PENDING` since 27 July because of it; the
 * code to activate them has been complete and audited that whole time and has
 * never been run. L3 in `BACKLOG.md` recorded it as done, which was true of the
 * code and not of any village.
 *
 * ## It is the same act, not a second implementation
 *
 * This calls `activateVillage` and `appointCoordinator` in
 * `src/lib/villages.ts` — the functions the screen calls, unchanged. It does
 * **not** reimplement minting, the status guard or the audit rows. Two
 * implementations of a privileged write is how they diverge, and the one that
 * diverges silently here would be the one that mints a code without flipping a
 * status, or flips a status without minting a code — which is a village
 * `checkVillageJoin` lets anybody into.
 *
 * ## The authority is the same too
 *
 * `--admin` must be an address in `ADMIN_EMAILS`, because `isPlatformAdmin` is
 * what both of those functions check and this builds the session they check it
 * against. With `ADMIN_EMAILS` unset **nobody** is an administrator and this
 * refuses everyone, exactly as `/admin/villages` does — an empty allow-list is
 * an empty allow-list, not a disabled check. It is not a way round the gate; it
 * is the same gate, reached without a browser.
 *
 * The address must also have a `User` row. That is not an extra rule invented
 * here — `AuditLog.actorId` is a foreign key, so a trail entry naming an id that
 * belongs to nobody cannot be written at all. The row's id is what
 * `session.user.id` is set to, which is the same id the screen would supply.
 *
 * ## What it deliberately does not do
 *
 * - **Rotate an existing code.** A village that already has one keeps it, which
 *   is `activateVillage`'s own rule: rotating on activation would invalidate a
 *   code that may already be on a poster. `regenerateJoinCode` is the deliberate
 *   way to change one and it is not wired up here, because rotating a code from
 *   a terminal with no confirmation of who is holding it is not an improvement.
 * - **Accept the compliance documents.** Nothing but a coordinator reading them
 *   may do that, and a script that ticked the boxes would record an acceptance
 *   nobody made. What it does instead is *report* the gate, because an activated
 *   village that then refuses every report is the surprise worth heading off.
 * - **Touch the seeded sample village.** It takes a slug and has no default.
 */

// Match Next.js precedence, as `prisma.config.ts` and the seed do.
config({ path: [".env.local", ".env"], quiet: true });

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm");

/** `--slug histon` or `--slug=histon`. */
function flagValue(name: string): string | null {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim() || null;

  const index = args.indexOf(name);
  if (index === -1) return null;

  const value = args[index + 1];
  // `--slug --confirm` is a missing value, not a village called "--confirm".
  if (!value || value.startsWith("--")) return null;

  return value.trim() || null;
}

const USAGE = [
  "Usage: npm run db:activate-village -- --slug <village-slug> --admin <email> [options]",
  "",
  "  --slug <slug>        Which village. Required, no default and no wildcard.",
  "                       The slug in the directory, e.g. histon-cambridgeshire.",
  "  --admin <email>      Who is activating it. Must be in ADMIN_EMAILS and must",
  "                       already have a VillageWatch account — the audit trail",
  "                       records them by id.",
  "  --coordinator <email>",
  "                       Also appoint this registered resident as the village's",
  "                       first coordinator. Optional; they must have an account.",
  "  --confirm            Actually write. Without it this is a dry run that",
  "                       prints what would happen and changes nothing.",
  "",
  "Activating a village mints its join code and puts it in the registration",
  "picker. It does NOT open reporting: the compliance gate stays closed until a",
  "coordinator has been through /dashboard/compliance. This prints where that",
  "stands so it is a decision rather than a discovery.",
].join("\n");

if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

const slug = flagValue("--slug");
const adminEmail = flagValue("--admin");
const coordinatorEmail = flagValue("--coordinator");

if (!slug || !adminEmail) {
  console.error(USAGE);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Add it to .env.local and try again.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** A tick, a cross or a dash, so the report scans without being read. */
function mark(state: boolean | null): string {
  if (state === null) return "–";
  return state ? "✓" : "✗";
}

async function main(): Promise<void> {
  // Imported here rather than at the top so `--help` and a missing DATABASE_URL
  // answer before anything reaches for a Supabase client or a Prisma singleton.
  const { isAdminConfigured, isAdminEmail } = await import("../src/lib/admin");
  const { activateVillage, appointCoordinator } = await import(
    "../src/lib/villages"
  );
  const { getVillageCompliance } = await import("../src/lib/compliance");
  const { buildJoinUrl } = await import("../src/lib/invite");
  const { VILLAGE_MODES, resolveVillageMode } = await import(
    "../src/lib/constants"
  );

  if (!isAdminConfigured) {
    console.error(
      "ADMIN_EMAILS is not set, so nobody is a platform administrator and this\n" +
        "refuses everyone — the same answer /admin/villages gives. Set it in\n" +
        ".env.local (and in Vercel, for the screen) and try again.",
    );
    process.exitCode = 1;
    return;
  }

  if (!isAdminEmail(adminEmail)) {
    console.error(
      `${adminEmail} is not in ADMIN_EMAILS. Only a platform administrator can\n` +
        "activate a village.",
    );
    process.exitCode = 1;
    return;
  }

  const admin = await prisma.user.findFirst({
    where: { email: { equals: adminEmail!, mode: "insensitive" } },
    select: { id: true, email: true, fullName: true, deletedAt: true },
  });

  if (!admin || admin.deletedAt) {
    console.error(
      `No open VillageWatch account for ${adminEmail}. Register at /register\n` +
        "first — the audit trail records who activated a village by id, and a\n" +
        "row naming nobody cannot be written.",
    );
    process.exitCode = 1;
    return;
  }

  const village = await prisma.village.findUnique({
    where: { slug: slug! },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      joinCode: true,
      region: true,
      parishCouncil: true,
      _count: { select: { users: true, incidents: true } },
    },
  });

  if (!village) {
    console.error(
      `No village with the slug "${slug}". Check the directory — the slug is\n` +
        "name-county, e.g. histon-cambridgeshire.",
    );
    process.exitCode = 1;
    return;
  }

  const compliance = await getVillageCompliance(village.id);
  const mode = resolveVillageMode(compliance.mode);
  // `VILLAGE_MODES` is an ordered list rather than a record, because the mode
  // form renders it in order. `find` cannot miss — `resolveVillageMode` narrows
  // to one of its own values — but the fallback keeps the report printable
  // rather than throwing on a value added to the list and not to this script.
  const modeMeta = VILLAGE_MODES.find((entry) => entry.value === mode);

  console.log("");
  console.log(`  ${village.name}${village.region ? `, ${village.region}` : ""}`);
  console.log(`  ${"─".repeat(56)}`);
  console.log(`  slug               ${village.slug}`);
  console.log(`  status             ${village.status}`);
  console.log(`  join code          ${village.joinCode ? "set" : "none yet"}`);
  console.log(`  residents          ${village._count.users}`);
  console.log(`  reports filed      ${village._count.incidents}`);
  console.log(
    `  compliance model   ${modeMeta?.label ?? mode} — ${modeMeta?.documents ?? "see /dashboard/compliance"}`,
  );
  console.log(
    `  data controller    ${village.parishCouncil ?? "not named (L2 — /reports will warn)"}`,
  );
  console.log("");

  // The half nobody expects: activating a village does not open it.
  if (compliance.available) {
    console.log("  Compliance gate");
    if (mode === "community") {
      console.log(
        `    ${mark(Boolean(compliance.communityDpa))} Community data processing agreement`,
      );
    } else {
      console.log(`    ${mark(Boolean(compliance.dpia))} DPIA`);
      console.log(`    ${mark(Boolean(compliance.apd))} Appropriate Policy Document`);
      console.log(`    ${mark(Boolean(compliance.dpa))} Processing agreement`);
    }
    console.log(
      compliance.complete
        ? "    → open: the village accepts reports."
        : "    → CLOSED: the village will accept no report until a coordinator\n" +
            "      has been through /dashboard/compliance. Activating it does not\n" +
            "      change that, and nothing here can accept on their behalf.",
    );
  } else {
    console.log(
      "  Compliance gate    columns missing — the migrations have not been\n" +
        "                     applied here, so reporting is allowed, loudly.",
    );
  }
  console.log("");

  const alreadyLive = village.status === "ACTIVE" && Boolean(village.joinCode);

  if (alreadyLive) {
    console.log(`  ${village.name} is already active. Nothing to do.`);
    console.log(
      "  To replace a code that has ended up somewhere it should not, use the\n" +
        "  Regenerate button on /admin/villages — deliberately not a flag here.",
    );
    console.log("");
    return;
  }

  console.log("  Would do");
  console.log(`    • mint a join code${village.joinCode ? " (already set — kept)" : ""}`);
  console.log(`    • set status ${village.status} → ACTIVE`);
  console.log("    • write a village.activated audit row");
  if (coordinatorEmail) {
    console.log(`    • appoint ${coordinatorEmail} as coordinator`);
  }
  console.log("");

  if (!CONFIRM) {
    console.log("  Dry run — nothing was written. Re-run with --confirm.");
    console.log("");
    return;
  }

  // The same session shape `/admin/villages` hands these functions. `profile` is
  // null because neither reads it: the authority is the address, not the role.
  const session = {
    user: { id: admin.id, email: admin.email },
    profile: null,
  } as unknown as Parameters<typeof activateVillage>[0]["session"];

  const activated = await activateVillage({ session, villageId: village.id });

  if (!activated.ok) {
    console.error(`  Activation refused: ${activated.error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`  ✓ ${activated.message}`);

  if (coordinatorEmail) {
    const appointed = await appointCoordinator({
      session,
      villageId: village.id,
      email: coordinatorEmail,
    });

    // Deliberately not a hard failure. The village is live either way, and the
    // usual reason this refuses is that the coordinator has not registered yet
    // — which they can now do, because there is a join code to do it with.
    console.log(
      appointed.ok ? `  ✓ ${appointed.message}` : `  ✗ ${appointed.error}`,
    );
  }

  if (activated.joinCode) {
    console.log("");
    console.log(`  Join code    ${activated.joinCode}`);
    console.log(
      `  Invite link  ${buildJoinUrl({ slug: village.slug, joinCode: activated.joinCode })}`,
    );
    console.log(
      "\n  The code is a credential — it is what turns a stranger with the\n" +
        "  village's name into a verified resident. It is not in the audit\n" +
        "  trail and this is the only place it is printed.",
    );
  }

  console.log("");
  console.log("  Next");
  console.log("    1. The coordinator signs in and accepts the compliance");
  console.log("       documents at /dashboard/compliance. Until then the");
  console.log("       village accepts no report.");
  console.log("    2. They name the data controller on /dashboard/settings.");
  console.log("    3. They share the invite from the same screen.");
  console.log("");
}

main()
  .catch((cause) => {
    console.error("Activation failed:", cause);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
