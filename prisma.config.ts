import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Match Next.js precedence: .env.local wins over .env. dotenv does not
// override keys that are already set, so order in this array is priority.
config({ path: [".env.local", ".env"], quiet: true });

/**
 * Prisma 7 configuration.
 *
 * The connection URL lives HERE, not in `prisma/schema.prisma` — the
 * `datasource db` block in the schema only declares the provider.
 *
 * This URL is used by the Prisma CLI only (`migrate`, `db pull`, `studio`).
 * The application runtime connects through the `@prisma/adapter-pg` driver
 * adapter configured in `src/lib/prisma.ts`.
 *
 * Use the DIRECT (non-pooled, port 5432) Supabase connection here: migrations
 * cannot run through pgBouncer. `DATABASE_URL` is the pooled fallback so that
 * `prisma generate` still works before the direct URL is configured.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
    shadowDatabaseUrl: process.env["SHADOW_DATABASE_URL"],
  },
});
