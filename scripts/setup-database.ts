import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { config } from "dotenv";

/**
 * Brings a database all the way up: the migrations, then the PostGIS triggers,
 * then row-level security — in that order, stopping at the first failure.
 *
 * ```bash
 * npm run db:setup            # report what would run, change nothing
 * npm run db:setup -- --apply # actually run it
 * ```
 *
 * ## Why this is a script and not a Prisma migration
 *
 * The obvious request is to fold `prisma/sql/postgis.sql` and
 * `prisma/sql/rls_policies.sql` into the migration history so that a plain
 * `prisma migrate deploy` produces a complete database. It cannot be done, and
 * the reasons are worth stating because the idea keeps coming back.
 *
 * 1. **`rls_policies.sql` is not a one-time step.** It has to be re-applied
 *    after *any* migration that adds a table or a column: a new table arrives
 *    with row-level security off, and the `villages` and `incidents` SELECT
 *    grants are enumerated per column, so a new column is invisible through
 *    PostgREST until it is named there. A migration runs once, so as a
 *    migration it would be correct on the day it was written and quietly wrong
 *    from the next schema change onwards — which is the failure mode that file
 *    exists to prevent.
 * 2. **The PostGIS objects are not in `schema.prisma` and must not be.** The
 *    geography columns are `Unsupported(...)`, and the triggers and GiST
 *    indexes that maintain them have no Prisma representation at all. Created
 *    by a migration they would be database objects the migrate engine cannot
 *    see in the schema, so `prisma migrate dev` would report them as drift and
 *    offer to drop them on every diff — the same trap the extensions list
 *    already causes, written down in the Prisma section of `CLAUDE.md`.
 * 3. **Both files are re-runnable by construction and a migration is not.**
 *    Every policy and trigger is dropped before it is created, the indexes are
 *    `IF NOT EXISTS` and the functions are `CREATE OR REPLACE`. That is the
 *    property that makes running them after every migration safe, and applying
 *    them through a mechanism that refuses to run twice would throw it away.
 *
 * So the order is the thing worth capturing, and this is where it is captured
 * for a person. `.github/workflows/database.yml` does the same three steps on a
 * push to `main` — **the two have to agree**, and if they ever diverge the
 * workflow is the one that runs against production.
 *
 * ## It is a dry run by default
 *
 * `prisma migrate deploy` applies pending migrations to whatever `DIRECT_URL`
 * points at, and on this project that is production — there is no staging
 * database. Two of the migrations close every village's reporting until a
 * coordinator has been through `/dashboard/compliance`, which is a visible
 * change to what residents can do. So the default prints the plan and the
 * pending migrations and stops, the same shape `clean-village.ts` and
 * `activate-village.ts` use, and `--apply` is the deliberate second step.
 */

config({ path: [".env.local", ".env"], quiet: true });

const POSTGIS_SQL = "prisma/sql/postgis.sql";
const RLS_SQL = "prisma/sql/rls_policies.sql";

const apply = process.argv.includes("--apply");

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

/**
 * `DIRECT_URL` and never `DATABASE_URL`.
 *
 * Migrations cannot run through pgBouncer, which is what the pooled 6543 URL
 * is. This is the same variable `prisma.config.ts` reads and the same one the
 * workflow uses, so a setup that works here works there.
 */
function databaseUrl(): string {
  const url = process.env.DIRECT_URL;

  if (!url) {
    fail(
      "DIRECT_URL is not set. It is the Supabase session pooler on port 5432 " +
        "(user postgres.<ref>) — not the pooled 6543 URL, which is pgBouncer " +
        "and cannot run migrations, and not db.<ref>.supabase.co, which is " +
        "IPv6-only. See SETUP.md step 3.",
    );
  }

  return url;
}

/** Is `psql` on the PATH? Both SQL files need it and neither can be run by Prisma. */
function requirePsql(): void {
  const probe = spawnSync("psql", ["--version"], { encoding: "utf8" });

  if (probe.error || probe.status !== 0) {
    fail(
      "psql is not on your PATH, and both SQL files below need it. " +
        "Install the PostgreSQL client tools — `brew install libpq` on macOS, " +
        "`apt install postgresql-client` on Debian or Ubuntu.",
    );
  }

  console.log(`  psql: ${probe.stdout.trim()}`);
}

/**
 * Runs one of the two SQL files.
 *
 * `ON_ERROR_STOP=1` is the load-bearing flag and is the same one the workflow
 * passes. Without it psql carries on past a failed statement and exits 0, which
 * would report a successful run over a half-applied policy file — and a policy
 * file that is half applied reads as applied and enforces nothing.
 */
function runSql(file: string, url: string): void {
  if (!existsSync(file)) fail(`${file} is missing from this checkout.`);

  console.log(`\n→ ${file}`);
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-f", file], {
    stdio: "inherit",
  });
}

function main(): void {
  const url = databaseUrl();

  console.log("VillageWatch database setup\n");
  console.log("  1. prisma migrate deploy");
  console.log(`  2. ${POSTGIS_SQL}`);
  console.log(`  3. ${RLS_SQL}`);
  console.log(
    "\nRow-level security runs last, and has to: the grants are enumerated\n" +
      "per column, so it is what makes a newly added column readable and a\n" +
      "newly added table protected.\n",
  );

  requirePsql();

  console.log("\n→ prisma migrate status");
  // `status` exits non-zero when migrations are pending, which is the ordinary
  // case here rather than a failure — so the exit code is deliberately ignored
  // and the output is what the reader is being shown.
  spawnSync("npx", ["prisma", "migrate", "status"], { stdio: "inherit" });

  if (!apply) {
    console.log(
      "\nDry run — nothing was applied.\n\n" +
        "Re-run with `npm run db:setup -- --apply` to apply the three steps\n" +
        "above against DIRECT_URL.\n\n" +
        "Read the pending list first. Two migrations in this repository close\n" +
        "every village's reporting until a coordinator has accepted the\n" +
        "compliance documents, which is a visible change to what residents can\n" +
        "do — see The compliance gate in CLAUDE.md.\n",
    );
    return;
  }

  console.log("\n→ prisma migrate deploy");
  execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });

  runSql(POSTGIS_SQL, url);
  runSql(RLS_SQL, url);

  console.log("\n→ prisma migrate status");
  spawnSync("npx", ["prisma", "migrate", "status"], { stdio: "inherit" });

  console.log("\n✓ Migrations, PostGIS and row-level security are applied.\n");
}

try {
  main();
} catch (cause) {
  // `execFileSync` throws on a non-zero exit and the child's own output has
  // already gone to the terminal, so what is added here is which step failed
  // and the fact that the ones after it did not run.
  console.error(
    "\n✗ Setup stopped. The step above did not succeed, and nothing after it " +
      "was run.\n\n  If it was row-level security, the migrations and PostGIS " +
      "are applied and\n  re-running is safe — every file here is re-runnable " +
      "by construction.\n",
  );
  if (cause instanceof Error && !("status" in cause)) console.error(cause);
  process.exit(1);
}
