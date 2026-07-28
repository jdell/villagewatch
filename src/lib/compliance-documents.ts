import { loadDocument, type LoadedDocument } from "@/lib/docs";

/**
 * The three documents `/dashboard/compliance` asks a coordinator to accept.
 * **Server only** — `src/lib/docs.ts` imports `node:fs`, so a Client Component
 * that reaches for anything here breaks the build.
 *
 * They are read from `docs/` at request time rather than being restated as JSX,
 * for the reason `legal-page.tsx` gives about legal text in a data structure: a
 * second copy is a copy that goes stale, and the one on screen would be the one
 * nobody proofreads. The markdown file *is* the document — the same file a
 * council is sent, reviews and signs — and this renders it.
 *
 * The read itself is in `src/lib/docs.ts`, which is also where the file-tracing
 * trap is written down: `outputFileTracingIncludes` in `next.config.ts` has to
 * name every one of these files against this route, or the page builds, deploys
 * and fails **only in production**. Add a document here and add it there in the
 * same commit.
 *
 * A read failure is returned rather than thrown. The page renders the failure —
 * with the path it looked for — instead of a 500, because a coordinator who
 * cannot see the documents needs to be told that specifically, and because the
 * acceptance form must not appear next to a document that did not load.
 */

export type ComplianceDocumentId = "dpia" | "apd" | "dpa";

type DocumentSource = {
  id: ComplianceDocumentId;
  /** Basename within `docs/`. Never a path — see `src/lib/docs.ts`. */
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

export type ComplianceDocument = DocumentSource & LoadedDocument;

async function load(source: DocumentSource): Promise<ComplianceDocument> {
  return { ...source, ...(await loadDocument(source.fileName)) };
}

export async function loadComplianceDocuments(): Promise<ComplianceDocument[]> {
  return Promise.all(COMPLIANCE_DOCUMENTS.map(load));
}
