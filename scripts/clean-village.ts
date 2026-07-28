import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { VILLAGE_STATUS_LABELS } from "../src/lib/constants";

/**
 * Empties one village of everything that was filed into it, and re-opens its
 * compliance gate — so a village used for testing can be handed to real
 * residents, or walked through from the beginning a second time.
 *
 * Run it with `npm run db:clean-village -- --slug <slug>`. **It prints and
 * changes nothing by default** — read the report, then re-run with `--confirm`.
 *
 * ## How this differs from `clean-seed-data.ts`, and why that matters
 *
 * They look similar and they are not the same tool. `clean-seed-data.ts` removes
 * *sample* data: it is hardcoded to one slug, matches five incidents by their
 * own invented titles, and leaves everything it did not recognise. It is safe by
 * construction, because it cannot be pointed anywhere else and cannot delete
 * anything it was not the author of.
 *
 * This one takes a slug and deletes **every report in that village** — filed by
 * a real resident or not, published or not. There is no title match and no
 * heuristic, because there is no way to tell a test report from a real one and
 * pretending otherwise would be worse than saying so. That is why the slug is
 * required rather than defaulted, why the dry run is the default, and why the
 * report prints the reporters' own count before it asks for `--confirm`.
 *
 * It is for a village that has been used to try the system out. It is not a
 * moderation tool and it is not the right to erasure — a resident deleting their
 * own report goes through the app, which writes an audit row first
 * (`src/lib/erasure.ts`).
 *
 * ## What it deletes
 *
 * - Every **incident**, and with it every **tag**, **media row** and
 *   **notification** that hangs off it by cascade.
 * - The **stored media objects** behind those rows, out of Supabase Storage —
 *   *before* the rows, never after. See below.
 * - Every **pattern alert** for the village, and the notifications for those.
 * - Every remaining **notification** belonging to a resident of the village —
 *   the ones about a coordinator application, which hang off no incident.
 *
 * ## What it deliberately does not
 *
 * - **The village row.** `AuditLog.villageId` is `ON DELETE SET NULL` and the
 *   append-only trigger refuses that update, so the delete would fail anyway —
 *   but the real reason is that there is no denormalised village name on the
 *   trail, so nulling it would destroy the only record of which village an
 *   entry belongs to.
 * - **Residents.** Nobody is signed out, nobody loses their account, and
 *   `verifiedAt` and roles are untouched. A village being emptied is not its
 *   people leaving.
 * - **The audit trail.** It cannot: the trigger rejects a DELETE from everyone
 *   including the table owner (domain rule 7). Rows naming a deleted incident
 *   will stop resolving, and the report counts them so that is a decision rather
 *   than a discovery.
 * - **The village's settings** — the parish council name, the privacy level, the
 *   WhatsApp Channel, auto-approve. Those are the coordinator's answers to
 *   questions the data does not change.
 *
 * ## Three rules inherited from the rest of the codebase
 *
 * 1. **Objects before rows** (`src/lib/erasure.ts`, and the retention job).
 *    Deleting an `IncidentMedia` row drops the only record of its storage path
 *    and orphans the file in the bucket forever. So the objects go first, and if
 *    they cannot go, the incidents that own them are left alone and reported.
 * 2. **Both variants of every file**, plus the video thumbnail derived from the
 *    same name — the same three paths `removeIncident` chases.
 * 3. **Fail towards leaving data alone.** Storage unreachable, a slug that
 *    matches nothing, a missing `--confirm`: every one of those exits having
 *    changed nothing.
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
  "Usage: npm run db:clean-village -- --slug <village-slug> [--confirm]",
  "",
  "  --slug <slug>  Which village. Required — there is no default and no",
  "                 wildcard. This is the slug in the village's own URL and",
  "                 in the directory, e.g. histon-cambridgeshire.",
  "  --confirm      Actually delete. Without it this is a dry run that prints",
  "                 what would go and changes nothing.",
  "  --keep-compliance",
  "                 Leave the DPIA, APD and DPA acceptances in place. By",
  "                 default they are cleared, so the coordinator walks through",
  "                 /dashboard/compliance again before the village accepts",
  "                 another report.",
  "",
  "Deletes EVERY incident in the named village, not just test data. It cannot",
  "tell one from the other. The village row, its settings and its residents are",
  "never touched.",
].join("\n");

if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}

const KEEP_COMPLIANCE = args.includes("--keep-compliance");
const SLUG = flagValue("--slug");

if (!SLUG) {
  console.error("No --slug given.\n");
  console.error(USAGE);
  process.exit(1);
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
// Storage
// ---------------------------------------------------------------------------

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? "incident-media";
const isStorageConfigured =
  SUPABASE_URL.length > 0 && SERVICE_ROLE_KEY.length > 0;

/** Paths per `remove()` call, matching `RETENTION_STORAGE_CHUNK`. */
const STORAGE_REMOVE_CHUNK = 100;

/**
 * Deletes objects from the media bucket. Null when storage is not configured —
 * which is different from "nothing to delete" and has to stay that way, because
 * it is the difference between a clean run and one that orphans every file.
 *
 * The service-role key is used directly rather than through
 * `src/lib/media/storage.ts`: that module is written for a request that has
 * already established a session and a village, and this script has neither.
 */
async function deleteStoredObjects(
  paths: readonly string[],
): Promise<{ deleted: number; failed: number } | null> {
  const unique = [...new Set(paths.filter(Boolean))];

  if (!isStorageConfigured) return null;
  if (unique.length === 0) return { deleted: 0, failed: 0 };

  const storage = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(STORAGE_BUCKET);

  let deleted = 0;
  let failed = 0;

  for (let index = 0; index < unique.length; index += STORAGE_REMOVE_CHUNK) {
    const chunk = unique.slice(index, index + STORAGE_REMOVE_CHUNK);
    const { data, error } = await storage.remove(chunk);

    if (error) {
      console.error(
        `  ⚠  Could not delete ${chunk.length} object(s) from ${STORAGE_BUCKET}:`,
        error.message,
      );
      failed += chunk.length;
      continue;
    }

    deleted += data?.length ?? 0;
  }

  return { deleted, failed };
}

/**
 * Postgres `42703` — undefined column — however Prisma surfaces it.
 *
 * The same test `src/lib/compliance.ts` makes, and for the same reason: the
 * three pairs of columns are in `schema.prisma` and may not be in the database,
 * because `20260728090000_village_compliance_gate` and
 * `20260728150000_village_dpa_gate` have not been applied everywhere. Reading a
 * missing column must read as "there is no acceptance to clear", not as a
 * failure that leaves half the work done.
 *
 * `dpa_accepted` is tested separately from `dpia_accepted`: they differ by one
 * letter and neither contains the other.
 */
function isMissingComplianceColumn(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;

  const code = (cause as { code?: unknown }).code;
  if (code === "P2022" || code === "42703") return true;

  const message = (cause as { message?: unknown }).message;
  return (
    typeof message === "string" &&
    (message.includes("dpia_accepted") ||
      message.includes("apd_accepted") ||
      message.includes("dpa_accepted"))
  );
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
      ? `Cleaning village "${SLUG}". This deletes rows and files.`
      : "Dry run — nothing will be changed. Re-run with --confirm to delete.",
  );

  const village = await prisma.village.findUnique({
    where: { slug: SLUG! },
    select: { id: true, name: true, slug: true, status: true },
  });

  if (!village) {
    console.log("");
    console.log(
      `No village with slug "${SLUG}". Check the spelling — the slug is the ` +
        "one in the village's URL, not its display name. Nothing to do.",
    );
    return;
  }

  heading(`Village: ${village.name} (${village.slug})`);
  bullet(`Status  ${VILLAGE_STATUS_LABELS[village.status]}`);

  // -------------------------------------------------------------------------
  // Incidents, and the media hanging off them
  // -------------------------------------------------------------------------

  const incidents = await prisma.incident.findMany({
    where: { villageId: village.id },
    select: {
      id: true,
      reference: true,
      title: true,
      status: true,
      reporterId: true,
      _count: { select: { media: true, tags: true } },
    },
    orderBy: { reference: "asc" },
  });

  const media = await prisma.incidentMedia.findMany({
    where: { incident: { villageId: village.id } },
    select: { id: true, incidentId: true, storagePath: true, redactedPath: true },
  });

  // Both variants of each file, plus the still generated for a clip — keyed off
  // the same name, and speculative for a photo, where there is no such object.
  const objectPaths = media.flatMap((row) =>
    [
      row.storagePath,
      row.redactedPath,
      row.storagePath.replace(/\.[^.]+$/, "-thumb.jpg"),
    ].filter((path): path is string => Boolean(path)),
  );

  const withReporter = incidents.filter((row) => row.reporterId !== null).length;
  const tagCount = incidents.reduce((sum, row) => sum + row._count.tags, 0);

  heading(`Incidents: ${incidents.length}`);

  if (incidents.length === 0) {
    bullet("None. Nothing to delete here.");
  } else {
    const byStatus = new Map<string, number>();
    for (const row of incidents) {
      byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + 1);
    }

    for (const [status, count] of [...byStatus].sort()) {
      bullet(`${String(count).padStart(4)}  ${status}`);
    }

    bullet("");
    bullet(`${tagCount} tag(s) and ${media.length} media row(s) go with them.`);
    bullet(
      `${withReporter} of them still name a reporter — those are somebody's ` +
        "reports.",
    );

    console.log("");
    for (const row of incidents.slice(0, 15)) {
      bullet(`   ${row.reference}  ${row.status.padEnd(14)} ${row.title}`);
    }
    if (incidents.length > 15) {
      bullet(`   …and ${incidents.length - 15} more.`);
    }
  }

  // -------------------------------------------------------------------------
  // Storage
  // -------------------------------------------------------------------------

  if (media.length > 0) {
    heading(`Stored files: up to ${objectPaths.length}`);

    if (!isStorageConfigured) {
      bullet("⚠  Supabase Storage is not configured here, so no file can be");
      bullet("   deleted — and therefore neither can the incidents that own");
      bullet("   them, because dropping the rows would orphan the objects in");
      bullet("   the bucket forever (src/lib/erasure.ts explains the order).");
      bullet("");
      bullet("   Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in");
      bullet("   .env.local and re-run. Incidents with no media are unaffected.");
    } else {
      bullet(
        `${media.length} media row(s), each with a blurred upload and possibly`,
      );
      bullet(
        "a redacted copy and a video still. The originals never reached the",
      );
      bullet("server, so there is no third file to chase (domain rule 3).");
    }
  }

  // -------------------------------------------------------------------------
  // Pattern alerts and notifications
  // -------------------------------------------------------------------------

  const patternAlerts = await prisma.patternAlert.count({
    where: { villageId: village.id },
  });

  // Everything addressed to a resident of this village. The ones about an
  // incident or a pattern alert would cascade anyway; these are the rest — a
  // coordinator application's decision, for one, which hangs off neither.
  const notifications = await prisma.notification.count({
    where: { user: { villageId: village.id } },
  });

  heading("Pattern alerts and notifications");
  bullet(`Pattern alerts  ${patternAlerts}`);
  bullet(`Notifications   ${notifications}  (to residents of this village)`);

  // -------------------------------------------------------------------------
  // Compliance
  // -------------------------------------------------------------------------

  heading("Compliance acceptances");

  let complianceAvailable = true;
  let acceptedCount = 0;

  try {
    const accepted = await prisma.village.findUnique({
      where: { id: village.id },
      select: {
        dpiaAcceptedAt: true,
        apdAcceptedAt: true,
        dpaAcceptedAt: true,
      },
    });

    acceptedCount = [
      accepted?.dpiaAcceptedAt,
      accepted?.apdAcceptedAt,
      accepted?.dpaAcceptedAt,
    ].filter(Boolean).length;

    if (KEEP_COMPLIANCE) {
      bullet(`${acceptedCount} of 3 accepted — left alone (--keep-compliance).`);
    } else if (acceptedCount === 0) {
      bullet("Nothing accepted. Already closed; nothing to reset.");
    } else {
      bullet(`${acceptedCount} of 3 accepted, and all three would be CLEARED.`);
      bullet("");
      bullet("⚠  This closes the village: it accepts no report at all until a");
      bullet("   coordinator has been through /dashboard/compliance again and");
      bullet("   re-accepted the DPIA, the APD and the processing agreement.");
      bullet("   Tell them before you run this, not after.");
    }
  } catch (cause) {
    if (!isMissingComplianceColumn(cause)) throw cause;

    complianceAvailable = false;
    bullet("The compliance columns do not exist in this database, so there is");
    bullet("nothing to reset. Migrations 20260728090000_village_compliance_gate");
    bullet("and 20260728150000_village_dpa_gate have not been applied here.");
  }

  // -------------------------------------------------------------------------
  // What cannot go
  // -------------------------------------------------------------------------

  const auditRows = await prisma.auditLog.count({
    where: { villageId: village.id },
  });

  const residents = await prisma.user.count({
    where: { villageId: village.id },
  });

  heading("Left alone");
  bullet(`Residents      ${residents}  — accounts, roles and verification kept.`);
  bullet(`Audit rows     ${auditRows}  — append-only, and cannot be deleted by`);
  bullet(
    "                    anyone including the table owner (domain rule 7).",
  );
  bullet("Village row    kept, with every setting on it.");

  if (auditRows > 0 && incidents.length > 0) {
    bullet("");
    bullet("⚠  Trail rows naming a deleted incident will stop resolving. That");
    bullet("   is the cost of emptying a village, and it is the right way");
    bullet("   round — a trail with a gap in it would be worse than one");
    bullet("   pointing at something that is gone.");
  }

  // -------------------------------------------------------------------------
  // Stop here on a dry run
  // -------------------------------------------------------------------------

  const clearsCompliance =
    !KEEP_COMPLIANCE && complianceAvailable && acceptedCount > 0;

  const nothingToDo =
    incidents.length === 0 &&
    patternAlerts === 0 &&
    notifications === 0 &&
    !clearsCompliance;

  if (nothingToDo) {
    console.log("");
    console.log("Nothing to do. This village is already empty.");
    return;
  }

  if (!CONFIRM) {
    console.log("");
    console.log("Dry run — nothing was changed.");
    console.log("Re-run with --confirm to delete:");
    console.log("");
    console.log(`  npm run db:clean-village -- --slug ${SLUG} --confirm`);
    return;
  }

  // -------------------------------------------------------------------------
  // Delete
  // -------------------------------------------------------------------------

  heading("Deleting");

  // Objects first. Rows only once their files are gone — the ordering the
  // retention job and `removeIncident` both use, for the same reason.
  let incidentsBlockedByStorage = 0;

  if (media.length > 0) {
    const removed = await deleteStoredObjects(objectPaths);

    if (removed === null) {
      incidentsBlockedByStorage = new Set(media.map((row) => row.incidentId))
        .size;
      bullet(
        `Storage not configured — 0 files deleted, and ${incidentsBlockedByStorage} ` +
          "incident(s) skipped.",
      );
    } else if (removed.failed > 0) {
      incidentsBlockedByStorage = new Set(media.map((row) => row.incidentId))
        .size;
      bullet(
        `${removed.deleted} file(s) deleted, ${removed.failed} failed — ` +
          `${incidentsBlockedByStorage} incident(s) skipped so nothing is orphaned.`,
      );
      bullet("Re-run once storage is reachable and they will be picked up.");
    } else {
      bullet(`${removed.deleted} file(s) deleted from ${STORAGE_BUCKET}.`);
    }
  }

  // Pattern alerts before incidents: the join between them cascades either way,
  // and this keeps the alert count in the report meaning what it said.
  if (patternAlerts > 0) {
    const { count } = await prisma.patternAlert.deleteMany({
      where: { villageId: village.id },
    });
    bullet(`${count} pattern alert(s) deleted, with their notifications.`);
  }

  const deletableIncidentIds =
    incidentsBlockedByStorage === 0
      ? incidents.map((row) => row.id)
      : incidents
          .filter((row) => row._count.media === 0)
          .map((row) => row.id);

  if (deletableIncidentIds.length > 0) {
    const { count } = await prisma.incident.deleteMany({
      where: { id: { in: deletableIncidentIds } },
    });
    bullet(
      `${count} incident(s) deleted, with their tags, media rows and notifications.`,
    );
  }

  if (incidentsBlockedByStorage > 0) {
    bullet(
      `${incidentsBlockedByStorage} incident(s) with attachments were NOT deleted.`,
    );
  }

  // Whatever is left: the notifications that hang off no incident and no
  // pattern alert, so nothing cascaded them.
  const { count: notificationsDeleted } = await prisma.notification.deleteMany({
    where: { user: { villageId: village.id } },
  });

  if (notificationsDeleted > 0) {
    bullet(`${notificationsDeleted} further notification(s) deleted.`);
  }

  if (clearsCompliance) {
    await prisma.village.update({
      where: { id: village.id },
      data: {
        dpiaAcceptedAt: null,
        dpiaAcceptedById: null,
        apdAcceptedAt: null,
        apdAcceptedById: null,
        dpaAcceptedAt: null,
        dpaAcceptedById: null,
      },
    });
    bullet("Compliance acceptances cleared — the village is closed again.");
    bullet(
      "  A coordinator must re-accept all three at /dashboard/compliance before",
    );
    bullet("  it can take another report.");
  }

  console.log("");
  console.log("Done.");
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
