import { readFile } from "node:fs/promises";
import path from "node:path";
import { type Block, parseMarkdown, tableOfContents } from "@/lib/markdown";

/**
 * The three documents `/dashboard/compliance` asks a coordinator to accept.
 * **Server only** — `node:fs` is imported at the top of this module, so a Client
 * Component that reaches for anything here breaks the build.
 *
 * They are read from `docs/` at request time rather than being restated as JSX,
 * for the reason `legal-page.tsx` gives about legal text in a data structure: a
 * second copy is a copy that goes stale, and the one on screen would be the one
 * nobody proofreads. The markdown file *is* the document — the same file a
 * council is sent, reviews and signs — and this renders it.
 *
 * ## The one deployment gotcha
 *
 * `docs/` is not code, so Next's file tracing does not know the serverless
 * function needs it. `outputFileTracingIncludes` in `next.config.ts` names both
 * files against this route; without that entry the page builds, deploys, and
 * fails at runtime on Vercel while working perfectly in `npm run dev`. Add a
 * document here and add it there in the same commit.
 *
 * A read failure is returned rather than thrown. The page renders the failure —
 * with the path it looked for — instead of a 500, because a coordinator who
 * cannot see the documents needs to be told that specifically, and because the
 * acceptance form must not appear next to a document that did not load.
 */

export type ComplianceDocumentId = "dpia" | "apd" | "dpa";

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

type DocumentSource = {
  id: ComplianceDocumentId;
  /** Basename within `docs/`. Never a path — see `DOCUMENT_DIRECTORY`. */
  fileName: string;
  /** What the tab and the acceptance checkbox call it. */
  label: string;
  shortLabel: string;
  /** One line under the tab, before the document itself. */
  summary: string;
  /** The instrument that makes it necessary. Rendered beside the checkbox. */
  basis: string;
};

export const COMPLIANCE_DOCUMENTS: readonly DocumentSource[] = [
  {
    id: "dpia",
    fileName: "DPIA.md",
    label: "Data Protection Impact Assessment",
    shortLabel: "DPIA",
    summary:
      "The assessment of what this processing risks and what reduces it. Required before the processing starts, not after.",
    basis: "UK GDPR Article 35",
  },
  {
    id: "apd",
    fileName: "APD_TEMPLATE.md",
    label: "Appropriate Policy Document",
    shortLabel: "APD",
    summary:
      "The safeguards that authorise processing criminal offence data at all. Without it there is no lawful basis for the reports this service exists to collect.",
    basis: "Data Protection Act 2018, Schedule 1, paragraph 5",
  },
  {
    id: "dpa",
    fileName: "DATA_PROCESSING_AGREEMENT.md",
    label: "Data Processing Agreement",
    shortLabel: "DPA",
    summary:
      "The contract between the council and Yakasista Ltd. A controller may only use a processor under a written agreement, so a village with none is in breach from the first report filed.",
    basis: "UK GDPR Article 28(3)",
  },
] as const;

export type ComplianceDocument = DocumentSource & {
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

async function load(source: DocumentSource): Promise<ComplianceDocument> {
  const repoPath = `${DOCUMENT_DIRECTORY}/${source.fileName}`;

  try {
    const raw = await readFile(
      // The literal directory segment goes in first. See `DOCUMENT_DIRECTORY`.
      path.join(process.cwd(), DOCUMENT_DIRECTORY, source.fileName),
      "utf8",
    );

    const blocks = parseMarkdown(raw);

    return {
      ...source,
      path: repoPath,
      ok: true,
      blocks,
      contents: tableOfContents(blocks),
    };
  } catch (cause) {
    console.error("Could not read %s", repoPath, cause);

    return {
      ...source,
      path: repoPath,
      ok: false,
      error:
        `${repoPath} could not be read on the server. On Vercel this means ` +
        "the file is not in `outputFileTracingIncludes` in next.config.ts.",
    };
  }
}

export async function loadComplianceDocuments(): Promise<ComplianceDocument[]> {
  return Promise.all(COMPLIANCE_DOCUMENTS.map(load));
}
