import { describe, expect, it } from "vitest";
import { headingId, parseMarkdown, tableOfContents } from "@/lib/markdown";

/**
 * The parser exists so `/dashboard/compliance` can show a coordinator the real
 * DPIA and Appropriate Policy Document before they accept them on their
 * council's behalf. What is worth asserting is therefore not that Markdown
 * parses, but that **the two documents in `docs/` survive it** — a heading that
 * silently vanished or a table row that lost a cell would be a legal document
 * misrepresented on the screen where somebody signs it.
 *
 * The underscore case is the one this was written for. Both documents are full
 * of snake_case column names outside backticks — `dpia_accepted_at`,
 * `raw_description`, `auto_approve` — and every Markdown implementation that
 * supports `_emphasis_` eats the middle of them.
 */

describe("inline parsing", () => {
  it("leaves snake_case identifiers alone", () => {
    const [block] = parseMarkdown("The dpia_accepted_at column is nullable.");

    expect(block).toEqual({
      kind: "paragraph",
      children: [
        { kind: "text", value: "The dpia_accepted_at column is nullable." },
      ],
    });
  });

  it("reads bold before italic", () => {
    const [block] = parseMarkdown("**Yes** and *no*");

    expect(block).toMatchObject({
      kind: "paragraph",
      children: [
        { kind: "strong", children: [{ kind: "text", value: "Yes" }] },
        { kind: "text", value: " and " },
        { kind: "em", children: [{ kind: "text", value: "no" }] },
      ],
    });
  });

  it("treats the contents of a code span as literal", () => {
    // A backtick span containing an asterisk must not become emphasis — this is
    // why code is first in the alternation.
    const [block] = parseMarkdown("Run `SELECT * FROM villages` first");

    expect(block).toMatchObject({
      children: [
        { kind: "text", value: "Run " },
        { kind: "code", value: "SELECT * FROM villages" },
        { kind: "text", value: " first" },
      ],
    });
  });

  it("parses a link and its label", () => {
    const [block] = parseMarkdown("See [the ICO](https://ico.org.uk) for more");

    expect(block).toMatchObject({
      children: [
        { kind: "text", value: "See " },
        {
          kind: "link",
          href: "https://ico.org.uk",
          children: [{ kind: "text", value: "the ICO" }],
        },
        { kind: "text", value: " for more" },
      ],
    });
  });

  it("handles the placeholder form both documents use", () => {
    // `*[Parish Council name]*` — emphasis wrapping brackets that are not a link.
    const [block] = parseMarkdown("Controller: *[Parish Council name]*");

    expect(block).toMatchObject({
      children: [
        { kind: "text", value: "Controller: " },
        {
          kind: "em",
          children: [{ kind: "text", value: "[Parish Council name]" }],
        },
      ],
    });
  });
});

describe("block parsing", () => {
  it("parses headings with stable anchors", () => {
    const [block] = parseMarkdown("## Step 7 — Retention");

    expect(block).toMatchObject({
      kind: "heading",
      level: 2,
      text: "Step 7 — Retention",
      id: "step-7-retention",
    });
  });

  it("never produces an empty anchor", () => {
    expect(headingId("———")).toBe("section");
  });

  it("parses a pipe table into head and rows", () => {
    const [block] = parseMarkdown(
      ["| Data | Retained |", "|---|---|", "| Reports | 12 months |"].join("\n"),
    );

    expect(block).toMatchObject({
      kind: "table",
      head: [
        [{ kind: "text", value: "Data" }],
        [{ kind: "text", value: "Retained" }],
      ],
      rows: [
        [
          [{ kind: "text", value: "Reports" }],
          [{ kind: "text", value: "12 months" }],
        ],
      ],
    });
  });

  it("reads --- as a rule rather than a heading underline", () => {
    const blocks = parseMarkdown("Text\n\n---\n\nMore");

    expect(blocks.map((block) => block.kind)).toEqual([
      "paragraph",
      "rule",
      "paragraph",
    ]);
  });

  it("keeps a fenced block literal", () => {
    const [block] = parseMarkdown(
      ["```bash", "npm run db:seed", "## not a heading", "```"].join("\n"),
    );

    expect(block).toEqual({
      kind: "code",
      value: "npm run db:seed\n## not a heading",
    });
  });

  it("parses bullet and numbered lists separately", () => {
    const blocks = parseMarkdown("- one\n- two\n\n1. first\n2. second");

    expect(blocks[0]).toMatchObject({ kind: "list", ordered: false });
    expect(blocks[1]).toMatchObject({ kind: "list", ordered: true });
    expect((blocks[0] as { items: unknown[] }).items).toHaveLength(2);
  });

  it("joins a wrapped list item rather than splitting it", () => {
    const [block] = parseMarkdown("- a long item that\n  wraps onto a second line");

    expect(block).toMatchObject({
      kind: "list",
      items: [[{ kind: "text", value: "a long item that wraps onto a second line" }]],
    });
  });

  it("parses a blockquote as a document of its own", () => {
    const [block] = parseMarkdown("> **This is a template.**\n> Read it first.");

    expect(block).toMatchObject({
      kind: "quote",
      blocks: [{ kind: "paragraph" }],
    });
  });

  it("terminates on input it does not understand", () => {
    // Every branch consumes at least one line. A parser that can spin is a page
    // that hangs the request, and this document is read on every page view.
    expect(() => parseMarkdown("<div>raw html</div>\n\n\n   \n\t\n")).not.toThrow();
  });
});

describe("tableOfContents", () => {
  it("takes the second and third level headings only", () => {
    const blocks = parseMarkdown(
      ["# Title", "## One", "### One a", "#### Too deep"].join("\n"),
    );

    expect(tableOfContents(blocks)).toEqual([
      { id: "one", title: "One", level: 2 },
      { id: "one-a", title: "One a", level: 3 },
    ]);
  });
});
