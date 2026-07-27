/**
 * A very small Markdown parser, producing a typed tree rather than HTML.
 *
 * ## Why this exists rather than a dependency
 *
 * `/dashboard/compliance` has to show a coordinator the *actual* DPIA and
 * Appropriate Policy Document before asking them to accept on their council's
 * behalf. Showing a summary and recording an acceptance of the full document
 * would be a worse legal gate than no gate at all. So the two markdown files in
 * `docs/` have to render on screen.
 *
 * Every markdown library brings an HTML string with it, which means
 * `dangerouslySetInnerHTML` and a sanitiser to go with it. This returns a tree
 * that `MarkdownView` renders as React elements — so there is no HTML string
 * anywhere in the path and nothing to sanitise. The same reasoning
 * `legal-page.tsx` gives for not installing `@tailwindcss/typography`: a
 * dependency for two pages is not worth it.
 *
 * ## What it supports, and what it deliberately does not
 *
 * Exactly what `docs/DPIA.md` and `docs/APD_TEMPLATE.md` use: ATX headings,
 * paragraphs, bullet and numbered lists, pipe tables, blockquotes, fenced code,
 * horizontal rules, and inline code, links, bold and italic.
 *
 * It is **not** a general Markdown implementation and must not be pointed at
 * untrusted input. It renders our own repository files, which is the whole
 * scope. Notable omissions, each of them deliberate:
 *
 * - **No `_underscore_` emphasis.** Both documents are full of snake_case column
 *   names — `dpia_accepted_at`, `auto_approve`, `raw_description` — and half of
 *   them appear outside backticks. Underscore emphasis would eat the middle of
 *   every one. `*asterisks*` are unambiguous here and are what the documents
 *   use.
 * - **No nested lists, no images, no HTML passthrough.** Nothing in either
 *   document uses them, and supporting a construct nothing exercises is a
 *   construct nobody has read the output of.
 */

export type Inline =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "strong"; children: Inline[] }
  | { kind: "em"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] };

export type Block =
  | { kind: "heading"; level: number; text: string; id: string; children: Inline[] }
  | { kind: "paragraph"; children: Inline[] }
  | { kind: "list"; ordered: boolean; items: Inline[][] }
  | { kind: "table"; head: Inline[][]; rows: Inline[][][] }
  | { kind: "quote"; blocks: Block[] }
  | { kind: "code"; value: string }
  | { kind: "rule" };

/**
 * One pass over the inline grammar.
 *
 * Alternation order is the grammar: code first, because its contents are
 * literal and a backtick span containing an asterisk must not become emphasis;
 * then links, whose label is parsed recursively; then `**strong**` before
 * `*em*`, or the two asterisks of a bold marker would each open an italic.
 */
const INLINE_PATTERN =
  /`([^`]+)`|\[([^\]]*)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|\*([^*]+)\*/;

function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let rest = source;

  while (rest.length > 0) {
    const match = INLINE_PATTERN.exec(rest);

    if (!match || match.index === undefined) {
      out.push({ kind: "text", value: rest });
      break;
    }

    if (match.index > 0) {
      out.push({ kind: "text", value: rest.slice(0, match.index) });
    }

    const [whole, code, linkText, href, strong, em] = match;

    if (code !== undefined) {
      out.push({ kind: "code", value: code });
    } else if (href !== undefined) {
      out.push({
        kind: "link",
        href,
        // An empty label renders as the URL, which is what a bare `[](href)`
        // means to a reader even though it means nothing to a parser.
        children: parseInline(linkText || href),
      });
    } else if (strong !== undefined) {
      out.push({ kind: "strong", children: parseInline(strong) });
    } else if (em !== undefined) {
      out.push({ kind: "em", children: parseInline(em) });
    }

    rest = rest.slice(match.index + whole.length);
  }

  return out.filter((node) => node.kind !== "text" || node.value.length > 0);
}

/** Plain text of an inline run — for a heading's anchor and its `title`. */
function inlineText(nodes: readonly Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.kind) {
        case "text":
        case "code":
          return node.value;
        default:
          return inlineText(node.children);
      }
    })
    .join("");
}

/**
 * A stable anchor for a heading.
 *
 * Both documents are long enough to need a contents list, and a coordinator
 * being asked to accept them needs to be able to jump to §7 Retention rather
 * than scroll for it. Deterministic from the text, so a link into the document
 * survives a re-render.
 */
export function headingId(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  // A heading that is entirely punctuation would otherwise produce `id=""`,
  // which is a duplicate on every such heading and an invalid fragment target.
  return slug || "section";
}

/** A table row's cells, with the leading and trailing pipes discarded. */
function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");
}

/**
 * Parses a Markdown document into blocks.
 *
 * Line-oriented and single-pass. Every branch consumes at least one line, so it
 * terminates on any input — including one it does not understand, which falls
 * through to a paragraph rather than looping.
 */
export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;

    // Blank
    if (line.trim().length === 0) {
      index += 1;
      continue;
    }

    // Fenced code. Everything to the closing fence is literal, including things
    // that look like other blocks — which is the whole point of a fence.
    const fence = /^\s*```/.exec(line);
    if (fence) {
      const body: string[] = [];
      index += 1;

      while (index < lines.length && !/^\s*```/.test(lines[index]!)) {
        body.push(lines[index]!);
        index += 1;
      }

      // Skip the closing fence when there is one; an unterminated fence simply
      // ends at the end of the document.
      if (index < lines.length) index += 1;

      blocks.push({ kind: "code", value: body.join("\n") });
      continue;
    }

    // Horizontal rule, before headings so `---` is never read as anything else.
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    // ATX heading
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const children = parseInline(heading[2]!.trim());
      const text = inlineText(children);

      blocks.push({
        kind: "heading",
        level: heading[1]!.length,
        text,
        id: headingId(text),
        children,
      });

      index += 1;
      continue;
    }

    // Blockquote — consecutive `>` lines, parsed as a document of their own.
    if (/^\s*>/.test(line)) {
      const body: string[] = [];

      while (index < lines.length && /^\s*>/.test(lines[index]!)) {
        body.push(lines[index]!.replace(/^\s*>\s?/, ""));
        index += 1;
      }

      blocks.push({ kind: "quote", blocks: parseMarkdown(body.join("\n")) });
      continue;
    }

    // Table — a pipe row followed by a divider row. Checked before lists,
    // because neither construct's first line is ambiguous but the order makes
    // that explicit.
    if (
      line.includes("|") &&
      index + 1 < lines.length &&
      isTableDivider(lines[index + 1]!)
    ) {
      const head = splitRow(line).map(parseInline);
      index += 2;

      const rows: Inline[][][] = [];

      while (
        index < lines.length &&
        lines[index]!.includes("|") &&
        lines[index]!.trim().length > 0
      ) {
        rows.push(splitRow(lines[index]!).map(parseInline));
        index += 1;
      }

      blocks.push({ kind: "table", head, rows });
      continue;
    }

    // Lists. A run of consecutive markers of the same flavour; a blank line or
    // anything else ends it.
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);

    if (bullet || numbered) {
      const ordered = numbered !== null && bullet === null;
      const items: Inline[][] = [];

      while (index < lines.length) {
        const current = lines[index]!;
        const match = ordered
          ? /^\s*\d+[.)]\s+(.*)$/.exec(current)
          : /^\s*[-*+]\s+(.*)$/.exec(current);

        if (!match) break;

        // A wrapped item: indented continuation lines belong to the item above
        // rather than starting a paragraph inside the list.
        const parts = [match[1]!];
        index += 1;

        while (
          index < lines.length &&
          /^\s{2,}\S/.test(lines[index]!) &&
          !/^\s*(?:[-*+]|\d+[.)])\s/.test(lines[index]!)
        ) {
          parts.push(lines[index]!.trim());
          index += 1;
        }

        items.push(parseInline(parts.join(" ")));
      }

      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    // Paragraph — everything up to a blank line or the start of another block.
    const parts: string[] = [];

    while (index < lines.length) {
      const current = lines[index]!;

      if (
        current.trim().length === 0 ||
        /^(#{1,6})\s/.test(current) ||
        /^\s*>/.test(current) ||
        /^\s*```/.test(current) ||
        /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(current) ||
        /^\s*(?:[-*+]|\d+[.)])\s/.test(current)
      ) {
        break;
      }

      parts.push(current.trim());
      index += 1;
    }

    if (parts.length > 0) {
      blocks.push({ kind: "paragraph", children: parseInline(parts.join(" ")) });
    } else {
      // Defensive: the loop above consumed nothing, which would spin. Cannot
      // happen given the branches above, and costs one line to make certain.
      index += 1;
    }
  }

  return blocks;
}

/** The `##` and `###` headings, for a contents list. */
export function tableOfContents(
  blocks: readonly Block[],
): { id: string; title: string; level: number }[] {
  return blocks
    .filter(
      (block): block is Extract<Block, { kind: "heading" }> =>
        block.kind === "heading" && (block.level === 2 || block.level === 3),
    )
    .map((block) => ({ id: block.id, title: block.text, level: block.level }));
}
