import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  SUPABASE_AUTH_TEMPLATE_LIST,
  SUPABASE_TEMPLATE_DIR,
} from "../src/lib/email/supabase-templates";

/**
 * Writes the four Supabase auth email templates to disk as `.html` files.
 *
 * An authoring tool, run by hand — the same shape as
 * `scripts/generate-icons.mjs`, and for the same reason: the artefact is
 * committed, the generator is not on any hot path, and nothing at runtime reads
 * either. Run it after changing a word in
 * `src/lib/email/supabase-templates/index.ts`:
 *
 *   npm run generate:supabase-templates
 *
 * The files exist because the destination is a form in somebody else's
 * dashboard. A coordinator or an operator setting up a project needs something
 * they can open, select all and paste — not a TypeScript constant they would
 * have to render first.
 *
 * `tests/supabase-templates.test.ts` is what stops the two drifting: it renders
 * every template from the module and compares it against the committed file, so
 * a change made here and not regenerated fails CI rather than shipping an email
 * whose wording nobody chose.
 */

async function main() {
  const root = process.cwd();
  const dir = path.join(root, SUPABASE_TEMPLATE_DIR);

  for (const template of SUPABASE_AUTH_TEMPLATE_LIST) {
    const file = path.join(dir, template.filename);
    await writeFile(file, `${template.html}\n`, "utf8");

    console.log(
      "  %s  →  %s",
      template.dashboardName.padEnd(22),
      path.relative(root, file),
    );
  }

  console.log(
    "\n%d templates written. Paste each into Supabase → Authentication → " +
      "Emails → Templates; the subject lines are in the module beside them, " +
      "and docs/SUPABASE_EMAIL_SETUP.md §5 is the procedure.",
    SUPABASE_AUTH_TEMPLATE_LIST.length,
  );
}

main().catch((cause) => {
  console.error("Could not write the Supabase templates", cause);
  process.exit(1);
});
