import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Prisma 7 has no Rust query engine — every connection goes through a driver
 * adapter. `DATABASE_URL` should be the POOLED Supabase connection (pgBouncer,
 * port 6543); migrations use `DIRECT_URL` via `prisma.config.ts` instead.
 *
 * The pool is created lazily by `pg`, so importing this module before the env
 * vars are configured is safe — only an actual query will fail.
 */
function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
  });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });
}

// Reuse the client across hot reloads in dev, otherwise every save leaks a pool.
const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
