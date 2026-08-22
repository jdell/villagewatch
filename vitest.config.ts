import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests only, and deliberately so.
 *
 * Nothing here starts a database, a Supabase project or an Anthropic account —
 * every module that reaches one of those is mocked at its boundary. That keeps
 * the suite runnable on a fresh clone with no `.env.local`, which is the same
 * property `.github/workflows/ci.yml` relies on for the lint, typecheck and
 * build steps beside it. A test that needed a secret would be a test CI could
 * not run, and an untested critical path is worse than a slow one.
 *
 * `environment: "node"` because everything under test is server code or is
 * client-safe by construction (`format-alert.ts`, `validations.ts`). Nothing
 * touches the DOM, so jsdom would be a dependency bought for nothing — and that
 * is still true of the one component test in here: `period-control.test.tsx`
 * renders to a string with `react-dom/server` and reads the markup, which is
 * what a crawler and a reader with no JavaScript get. Widening `include` to
 * `.tsx` buys that and nothing else; a test that wanted to *click* something
 * would want jsdom, and would be the test this suite does not take.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Explicit imports from "vitest" in every file rather than globals, so
    // `npm run typecheck` sees the same names the runner does without adding
    // `vitest/globals` to the tsconfig `types` array.
    globals: false,
  },
  resolve: {
    // The `@/*` path alias from tsconfig.json. Vitest does not read tsconfig
    // paths on its own.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
