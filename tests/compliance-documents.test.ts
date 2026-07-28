import { describe, expect, it } from "vitest";
import {
  COMPLIANCE_DOCUMENTS,
  loadComplianceDocuments,
} from "@/lib/compliance-documents";

/**
 * The three documents the compliance page renders in full.
 *
 * This is the one test in the suite that touches the filesystem, and it earns
 * that because the failure it catches is invisible until a coordinator opens the
 * page: a document that has been renamed, moved or written in Markdown the
 * parser chokes on renders as a red "could not be loaded" panel next to an
 * acceptance form that still works. A council would be accepting a document it
 * was not shown.
 *
 * No secret, no database, no network — it reads three files out of the working
 * tree, so CI runs it on a fresh clone like everything else.
 *
 * What it deliberately does **not** assert is the wording. These are legal
 * documents under review by a council; pinning sentences here would mean a
 * failing test every time somebody corrects one, which trains people to edit the
 * assertion rather than read the change.
 */

describe("the compliance documents", () => {
  it("registers three documents, each naming its legal instrument", () => {
    expect(COMPLIANCE_DOCUMENTS.map((document) => document.id)).toEqual([
      "dpia",
      "apd",
      "dpa",
    ]);

    for (const document of COMPLIANCE_DOCUMENTS) {
      expect(document.basis, document.id).not.toBe("");
      expect(document.label, document.id).not.toBe("");
    }
  });

  it("reads and parses every one of them", async () => {
    const documents = await loadComplianceDocuments();

    for (const document of documents) {
      // `ok: false` is what ships to the page as a red panel. On Vercel it means
      // the file is missing from `outputFileTracingIncludes`; here it means the
      // file is missing full stop.
      expect(document.ok, `${document.path} failed to load`).toBe(true);

      if (!document.ok) continue;

      expect(document.blocks.length).toBeGreaterThan(0);

      // A document with no headings has nothing to jump to, which is how a
      // coordinator navigates something this long.
      expect(document.contents.length).toBeGreaterThan(0);
    }
  });

  it("gives the processing agreement the eight Article 28(3) obligations", async () => {
    const documents = await loadComplianceDocuments();
    const dpa = documents.find((document) => document.id === "dpa");

    expect(dpa?.ok).toBe(true);
    if (!dpa?.ok) return;

    // Article 28(3)(a) to (h). The sub-headings are lettered to match the
    // Article, so a missing letter is a missing obligation rather than a
    // formatting slip — and an agreement missing one of them does not meet
    // Article 28(3) at all.
    const headings = dpa.contents.map((entry) => entry.title);

    for (const letter of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      expect(
        headings.some((title) => title.startsWith(`(${letter})`)),
        `Article 28(3)(${letter})`,
      ).toBe(true);
    }
  });
});
