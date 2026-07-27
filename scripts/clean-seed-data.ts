import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { VILLAGE_STATUS_LABELS } from "../src/lib/constants";

/**
 * Removes the sample data `prisma/seed.ts` creates, before a real resident sees
 * it.
 *
 * Run it with `npm run db:clean-seed`. **It prints and changes nothing by
 * default** — read the report, then re-run with `--confirm`.
 *
 * ## What it targets, and what it refuses to
 *
 * Exactly three things, all inside the one village `prisma/seed.ts` creates:
 *
 * - the five sample **incidents**, matched by their own hardcoded titles;
 * - the one sample **pattern alert**, matched by `detector: "seed"` — the seed
 *   sets that value precisely so a row nothing generated cannot be mistaken for
 *   one Claude wrote;
 * - the sample **coordinator profile**, and only when it is confirmed to have no
 *   Supabase auth user behind it.
 *
 * Everything else in that village is reported and left alone. A real report
 * filed into the sample village during testing is still somebody's report, and
 * a script that decided otherwise on a slug match would be the worst kind of
 * cleanup tool.
 *
 * ## The interlock
 *
 * The brief for this script asked it to run "only if `SEED_ADMIN_USER_ID`
 * matches the seed's hardcoded id". There is no such constant — `prisma/seed.ts`
 * reads that id from the environment and invents a random uuid when it is
 * absent, so a comparison against it would be a comparison against nothing. What
 * the seed *does* hardcode is the village slug, so that is the interlock: this
 * script resolves its target by `slug = "your-village"` and has no flag, no
 * argument and no environment variable that can point it at another village.
 * Against a database that was never seeded it finds nothing and exits.
 *
 * `SEED_ADMIN_USER_ID` still matters, but as a protection rather than a gate: a
 * profile whose id is in that variable is a real Supabase auth user and is never
 * deleted.
 *
 * ## Three rules it inherits from the rest of the codebase
 *
 * 1. **Objects before rows** (`src/lib/erasure.ts`). Deleting an
 *    `IncidentMedia` row drops the only record of its storage path and orphans
 *    the file forever. The seed attaches no media, so a target incident that has
 *    some is not seed data — it is skipped and reported rather than deleted.
 * 2. **`AuditLog` is append-only** (domain rule 7). Nothing here deletes a trail
 *    row, and the database trigger would refuse if it tried. Where deleting an
 *    incident would leave trail rows naming an id that no longer resolves, the
 *    report says so and how many.
 * 3. **A real user is one Supabase Auth knows about.** With
 *    `SUPABASE_SERVICE_ROLE_KEY` set, every profile in the village is checked
 *    against `auth.users` and only the ones with no auth row are candidates for
 *    deletion. Without it, no profile is deleted at all — guessing which
 *    resident is fake is not a thing to do from an environment variable.
 */

// Match Next.js precedence, as `prisma.config.ts` and the seed do.
config({ path: [".env.local", ".env"], quiet: true });

// ---------------------------------------------------------------------------
// What the seed hardcodes
// ---------------------------------------------------------------------------

/**
 * The interlock. `prisma/seed.ts` upserts on this slug and nothing else in the
 * codebase writes it, so it is the one identifier that means "sample village".
 */
const VILLAGE_SLUG = "your-village";

/** The seed's own `INCIDENTS` titles, verbatim. Change one there, change it here. */
const SEED_INCIDENT_TITLES: readonly string[] = [
  "Van window smashed overnight by the Green",
  "Group drinking and shouting at the recreation ground",
  "Shed forced open on Church Row",
  "Fallen branch blocking Mill Lane",
  "Two callers claiming to be from the water board",
];

/** `seedPatternAlert` writes this rather than a model name, for the same reason. */
const SEED_PATTERN_DETECTOR = "seed";

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm");
const DEACTIVATE = args.includes("--deactivate");

if (args.includes("--help") || args.includes("-h")) {
  console.log(
    [
      "Usage: npm run db:clean-seed [-- --confirm] [-- --deactivate]",
      "",
      "  (no flags)     Dry run. Prints what would be deleted and changes nothing.",
      "  --confirm      Actually delete it.",
      "  --deactivate   Also take the sample village out of the register and",
      "                 welcome pickers by setting its status to ARCHIVED. The",
      "                 village row itself is never deleted — audit trail rows",
      "                 reference it and the trail is append-only.",
      "",
      `Only ever touches the village with slug "${VILLAGE_SLUG}".`,
    ].join("\n"),
  );
  process.exit(0);
}

const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    "No DIRECT_URL or DATABASE_URL. Copy .env.example to .env.local and fill " +
      "in the Supabase connection strings first.",
  );
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

// ---------------------------------------------------------------------------
// Is this profile a real person?
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const canCheckAuth = SUPABASE_URL.length > 0 && SERVICE_ROLE_KEY.length > 0;

/**
 * Whether Supabase Auth has a user with this id.
 *
 * `User.id` mirrors `auth.users.id`, so this is the only honest test of "real
 * user": a profile with no auth row behind it is one the seed invented with
 * `randomUUID()` and nobody can ever sign in as. A lookup that errors for any
 * other reason answers **true** — the fail-closed direction, because the cost of
 * being wrong is deleting somebody's account.
 */
async function hasAuthUser(id: string): Promise<boolean> {
  if (!canCheckAuth) return true;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.auth.admin.getUserById(id);

  if (error) {
    // Supabase answers a genuine miss with a 404 and this shape. Anything else
    // is a transport or permission problem and must not read as "delete them".
    const status = (error as { status?: number }).status;
    if (status === 404) return false;

    console.warn(
      `  ⚠  Could not check Supabase Auth for ${id} (${error.message}). ` +
        "Treating it as a real account and leaving it alone.",
    );
    return true;
  }

  return Boolean(data.user);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function heading(text: string) {
  console.log("");
  console.log(text);
  console.log("─".repeat(Math.min(text.length, 72)));
}

function bullet(text: string) {
  console.log(`  ${text}`);
}

async function main() {
  console.log(
    CONFIRM
      ? "Cleaning seed data. This deletes rows."
      : "Dry run — nothing will be changed. Re-run with --confirm to delete.",
  );

  const village = await prisma.village.findUnique({
    where: { slug: VILLAGE_SLUG },
    select: { id: true, name: true, slug: true, status: true, joinCode: true },
  });

  if (!village) {
    console.log("");
    console.log(
      `No village with slug "${VILLAGE_SLUG}". This database was never seeded ` +
        "with sample data, or it has already been cleaned. Nothing to do.",
    );
    return;
  }

  heading(`Sample village: ${village.name} (${village.slug})`);
  bullet(`Status       ${VILLAGE_STATUS_LABELS[village.status]}`);
  bullet(`Join code    ${village.joinCode ?? "(none)"}`);

  // -------------------------------------------------------------------------
  // Incidents
  // -------------------------------------------------------------------------

  const incidents = await prisma.incident.findMany({
    where: { villageId: village.id },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      _count: { select: { media: true, tags: true } },
    },
    orderBy: { reference: "asc" },
  });

  const seedTitles = new Set(SEED_INCIDENT_TITLES);
  const looksSeeded = incidents.filter((row) => seedTitles.has(row.title));
  const notSeeded = incidents.filter((row) => !seedTitles.has(row.title));

  // The seed attaches no media. One that has some was filed through the wizard,
  // whatever its title says, and deleting the row would orphan the object.
  const withMedia = looksSeeded.filter((row) => row._count.media > 0);
  const incidentsToDelete = looksSeeded.filter((row) => row._count.media === 0);

  heading(`Incidents in this village: ${incidents.length}`);

  if (incidentsToDelete.length === 0) {
    bullet("No sample incidents left to delete.");
  } else {
    bullet(`${incidentsToDelete.length} sample incident(s) would be DELETED:`);
    for (const row of incidentsToDelete) {
      bullet(`   ${row.reference}  ${row.status.padEnd(14)} ${row.title}`);
    }
    const tags = incidentsToDelete.reduce((sum, row) => sum + row._count.tags, 0);
    bullet(`   …and ${tags} tag(s) with them, by cascade.`);
  }

  if (withMedia.length > 0) {
    console.log("");
    bullet(
      `⚠  ${withMedia.length} incident(s) match a sample title but have media ` +
        "attached, so they are NOT sample data and are left alone:",
    );
    for (const row of withMedia) bullet(`   ${row.reference}  ${row.title}`);
    bullet(
      "   Delete those through the app if you mean to — it removes the stored",
    );
    bullet("   objects first (src/lib/erasure.ts). This script never will.");
  }

  if (notSeeded.length > 0) {
    console.log("");
    bullet(`${notSeeded.length} other incident(s) in this village, left alone:`);
    for (const row of notSeeded.slice(0, 10)) {
      bullet(`   ${row.reference}  ${row.status.padEnd(14)} ${row.title}`);
    }
    if (notSeeded.length > 10) bullet(`   …and ${notSeeded.length - 10} more.`);
  }

  // Nothing here deletes a trail row — the trigger would refuse (domain rule 7)
  // — but a coordinator reading the audit viewer afterwards deserves to know the
  // ids stopped resolving, so it is counted and said out loud.
  const orphanedAuditRows =
    incidentsToDelete.length === 0
      ? 0
      : await prisma.auditLog.count({
          where: {
            entityType: "Incident",
            entityId: { in: incidentsToDelete.map((row) => row.id) },
          },
        });

  // -------------------------------------------------------------------------
  // Pattern alerts
  // -------------------------------------------------------------------------

  const patternAlerts = await prisma.patternAlert.findMany({
    where: { villageId: village.id },
    select: { id: true, title: true, detector: true, windowStart: true },
    orderBy: { windowStart: "asc" },
  });

  const alertsToDelete = patternAlerts.filter(
    (row) => row.detector === SEED_PATTERN_DETECTOR,
  );
  const alertsKept = patternAlerts.filter(
    (row) => row.detector !== SEED_PATTERN_DETECTOR,
  );

  heading(`Pattern alerts in this village: ${patternAlerts.length}`);

  if (alertsToDelete.length === 0) {
    bullet("No sample pattern alerts left to delete.");
  } else {
    bullet(`${alertsToDelete.length} would be DELETED (detector = "seed"):`);
    for (const row of alertsToDelete) bullet(`   ${row.title}`);
  }

  if (alertsKept.length > 0) {
    bullet(
      `${alertsKept.length} written by the weekly digest, left alone: ` +
        alertsKept.map((row) => row.detector).join(", "),
    );
  }

  // -------------------------------------------------------------------------
  // Users
  // -------------------------------------------------------------------------

  const residents = await prisma.user.findMany({
    where: { villageId: village.id },
    select: { id: true, email: true, fullName: true, role: true },
    orderBy: { email: "asc" },
  });

  heading(`Profiles in this village: ${residents.length}`);

  const usersToDelete: typeof residents = [];

  if (!canCheckAuth) {
    bullet(
      "⚠  SUPABASE_SERVICE_ROLE_KEY is not set, so no profile can be confirmed",
    );
    bullet("   fake. All of them are left alone. Set it and re-run to include");
    bullet("   the sample coordinator.");
    for (const row of residents) {
      bullet(`   ${row.email}  ${row.role}  ${row.fullName}`);
    }
  } else {
    const protectedId = process.env.SEED_ADMIN_USER_ID?.trim();

    for (const row of residents) {
      if (protectedId && row.id === protectedId) {
        bullet(`${row.email}  — kept, this is SEED_ADMIN_USER_ID.`);
        continue;
      }

      if (await hasAuthUser(row.id)) {
        bullet(`${row.email}  — kept, a real Supabase Auth account exists.`);
        continue;
      }

      bullet(`${row.email}  — would be DELETED, no Supabase Auth account.`);
      usersToDelete.push(row);
    }
  }

  const notificationsToDelete =
    usersToDelete.length === 0
      ? 0
      : await prisma.notification.count({
          where: { userId: { in: usersToDelete.map((row) => row.id) } },
        });

  // -------------------------------------------------------------------------
  // Summary and consequences
  // -------------------------------------------------------------------------

  heading("Summary");
  bullet(`Incidents      ${incidentsToDelete.length}`);
  bullet(`Pattern alerts ${alertsToDelete.length}`);
  bullet(`Profiles       ${usersToDelete.length}`);

  if (orphanedAuditRows > 0) {
    console.log("");
    bullet(
      `⚠  ${orphanedAuditRows} audit trail row(s) reference these incidents and`,
    );
    bullet("   CANNOT be deleted — the trail is append-only and the database");
    bullet("   trigger rejects it (domain rule 7). They will name ids that no");
    bullet("   longer resolve. That is the cost of cleaning up after testing,");
    bullet("   and it is the right way round: a trail with a gap in it would be");
    bullet("   worse than one pointing at something that is gone.");
  }

  if (notificationsToDelete > 0) {
    bullet(
      `${notificationsToDelete} notification row(s) go with those profiles, by cascade.`,
    );
  }

  const nothingToDo =
    incidentsToDelete.length === 0 &&
    alertsToDelete.length === 0 &&
    usersToDelete.length === 0;

  if (nothingToDo && !DEACTIVATE) {
    console.log("");
    console.log("Nothing to delete. This database is already clean.");
    reportVillageStatus(village.status);
    return;
  }

  if (!CONFIRM) {
    console.log("");
    console.log("Dry run — nothing was changed.");
    console.log("Re-run with --confirm to delete:");
    console.log("");
    console.log("  npm run db:clean-seed -- --confirm");
    reportVillageStatus(village.status);
    return;
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  heading("Deleting");

  if (alertsToDelete.length > 0) {
    const { count } = await prisma.patternAlert.deleteMany({
      where: { id: { in: alertsToDelete.map((row) => row.id) } },
    });
    bullet(`${count} pattern alert(s) deleted.`);
  }

  if (incidentsToDelete.length > 0) {
    // Tags, media rows and notifications all cascade from the incident. There
    // are no media rows by construction — anything that had them was excluded
    // above — so nothing in storage is orphaned by this.
    const { count } = await prisma.incident.deleteMany({
      where: { id: { in: incidentsToDelete.map((row) => row.id) } },
    });
    bullet(`${count} incident(s) deleted, with their tags.`);
  }

  if (usersToDelete.length > 0) {
    // `AuditLog.actorId` is ON DELETE SET NULL, and severing it is the one
    // update the append-only trigger allows — `actorEmail` and `actorRole` are
    // denormalised onto every row for exactly this moment, so the trail still
    // says who did what.
    const { count } = await prisma.user.deleteMany({
      where: { id: { in: usersToDelete.map((row) => row.id) } },
    });
    bullet(`${count} profile(s) deleted, with their notifications.`);
  }

  if (DEACTIVATE && village.status !== "ARCHIVED") {
    await prisma.village.update({
      where: { id: village.id },
      data: { status: "ARCHIVED" },
    });
    bullet(
      "Village status set to ARCHIVED — it is out of the /register and /welcome pickers.",
    );
  }

  console.log("");
  console.log("Done.");
  reportVillageStatus(DEACTIVATE ? "ARCHIVED" : village.status);
}

/**
 * The sample village row itself is never deleted.
 *
 * `AuditLog.villageId` is `ON DELETE SET NULL` and the append-only trigger
 * deliberately does **not** carve that column out — there is no denormalised
 * village name on the trail, so nulling it would destroy the only record of
 * which village an entry belongs to. `DELETE FROM villages` therefore fails, and
 * should. Taking it out of the pickers is a status change instead.
 */
function reportVillageStatus(status: keyof typeof VILLAGE_STATUS_LABELS) {
  if (status !== "ACTIVE") return;

  console.log("");
  console.log(
    `  ⚠  The sample village is still ACTIVE, so "[Your Village]" appears in\n` +
      "     the picker on /register and /welcome. Re-run with --deactivate, or:\n" +
      "\n" +
      `       UPDATE villages SET status = 'ARCHIVED' WHERE slug = '${VILLAGE_SLUG}';`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("Clean-up failed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
