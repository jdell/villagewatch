import { loadDocument, type LoadedDocument } from "@/lib/docs";
import {
  documentsForMode,
  type ComplianceDocumentId,
  type VillageMode,
} from "@/lib/constants";

/**
 * The documents `/dashboard/compliance` asks a coordinator to accept, and which
 * of them a village's `mode` calls for. **Server only** — `src/lib/docs.ts`
 * imports `node:fs`, so a Client Component that reaches for anything here breaks
 * the build.
 *
 * Four sources, and no village sees all four: `documentsForMode` picks the three
 * a council adopts or the one a community coordinator accepts. They are declared
 * in one list because they are the same kind of thing and the loader, the
 * tracing entry in `next.config.ts` and the test that parses them all want one
 * place to iterate.
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
  {
    id: "community",
    fileName: "COMMUNITY_DPA.md",
    label: "Community Coordinator Agreement",
    shortLabel: "Agreement",
    summary:
      "One document for a village with no council behind it: the processing terms with Yakasista Ltd, and the policy document that authorises collecting reports about suspected crime at all.",
    // Both instruments, because it carries both. The council model splits them
    // across two documents because a council is separately obliged to hold an
    // Appropriate Policy Document of its own; a coordinator is not, and one
    // document a volunteer reads beats two they do not.
    basis: "UK GDPR Article 28(3) · Data Protection Act 2018, Schedule 1, paragraph 5",
  },
] as const;

export const COMPLIANCE_DOCUMENT_META = Object.fromEntries(
  COMPLIANCE_DOCUMENTS.map((d) => [d.id, d]),
) as Record<ComplianceDocumentId, DocumentSource>;

export type ComplianceDocument = DocumentSource & LoadedDocument;

async function load(source: DocumentSource): Promise<ComplianceDocument> {
  return { ...source, ...(await loadDocument(source.fileName)) };
}

/**
 * Loads the documents this village's mode calls for, in the order they are
 * rendered.
 *
 * The council order is the one `COMPLIANCE_DOCUMENTS` declares and it is
 * deliberate: the assessment first, because it explains what the processing is;
 * then the policy document that authorises the criminal offence data in it;
 * then the contract. Community mode has one, so the question does not arise.
 */
export async function loadComplianceDocuments(
  mode: VillageMode,
): Promise<ComplianceDocument[]> {
  const wanted = documentsForMode(mode);

  return Promise.all(
    COMPLIANCE_DOCUMENTS.filter((source) => wanted.includes(source.id)).map(
      load,
    ),
  );
}
