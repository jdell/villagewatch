import { readFile } from "node:fs/promises";
import path from "node:path";
import { type Block, parseMarkdown, tableOfContents } from "@/lib/markdown";

/**
 * Reading a Markdown file out of `docs/` and parsing it for the screen.
 * **Server only** — `node:fs` is imported at the top of this module, so a Client
 * Component that reaches for anything here breaks the build.
 *
 * Two screens do this: `/dashboard/compliance` renders the three documents a
 * coordinator accepts on their council's behalf, and `/dashboard/guide` renders
 * the coordinator guide. Both show the *actual* file from the repository rather
 * than a restatement of it, for the reason `legal-page.tsx` gives about legal
 * text in a data structure — a second copy is a copy that goes stale, and the
 * one on screen would be the one nobody proofreads.
 *
 * ## The one deployment gotcha, and why this module exists
 *
 * `docs/` is not code, so Next's file tracing does not know a serverless
 * function needs it. `outputFileTracingIncludes` in `next.config.ts` names every
 * file against the route that reads it; without that entry the page builds,
 * deploys, and fails at runtime on Vercel while working perfectly in
 * `npm run dev`. **Add a document, and add it there in the same commit.**
 *
 * That trap is the reason the read lives here once rather than at each call
 * site. A read failure is returned rather than thrown, so a page can render the
 * failure — with the path it looked for — instead of a 500.
 */

/**
 * The directory, as a literal.
 *
 * `path.join(process.cwd(), someVariable)` makes Turbopack trace the entire
 * project into the serverless bundle — it cannot see where a dynamic path
 * leads, so it assumes anywhere. Joining a literal segment before the variable
 * one is what keeps the trace scoped to this directory, and it is the fix the
 * build warning itself names. Keep the literal here and the filename separate.
 */
const DOCUMENT_DIRECTORY = "docs";

/**
 * The practical guide `/dashboard/guide` renders, and the compliance page links
 * to once all three documents are accepted.
 *
 * It is not part of the compliance gate and accepting nothing depends on it —
 * it is how to run a village, not what the council is signing. It lives in
 * `docs/` with the other three because it is subject to the same rule: every
 * statement in it is a statement about how the software behaves, so changing the
 * behaviour changes the guide in the same commit.
 */
export const COORDINATOR_GUIDE_FILE = "COORDINATOR_GUIDE.md";

export type LoadedDocument = {
  /** Repository-relative, for the caption and the failure message. */
  path: string;
} & (
  | {
      ok: true;
      blocks: Block[];
      contents: { id: string; title: string; level: number }[];
    }
  | { ok: false; error: string }
);

/**
 * Reads one file from `docs/` and parses it.
 *
 * `fileName` is a basename and never a path — see `DOCUMENT_DIRECTORY`. It comes
 * from a constant in this repository in both call sites; nothing user-supplied
 * reaches it, and nothing should.
 */
export async function loadDocument(fileName: string): Promise<LoadedDocument> {
  const repoPath = `${DOCUMENT_DIRECTORY}/${fileName}`;

  try {
    const raw = await readFile(
      // The literal directory segment goes in first. See `DOCUMENT_DIRECTORY`.
      path.join(process.cwd(), DOCUMENT_DIRECTORY, fileName),
      "utf8",
    );

    const blocks = parseMarkdown(raw);

    return {
      path: repoPath,
      ok: true,
      blocks,
      contents: tableOfContents(blocks),
    };
  } catch (cause) {
    console.error("Could not read %s", repoPath, cause);

    return {
      path: repoPath,
      ok: false,
      error:
        `${repoPath} could not be read on the server. On Vercel this means ` +
        "the file is not in `outputFileTracingIncludes` in next.config.ts.",
    };
  }
}
