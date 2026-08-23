import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import {
  Document,
  Font,
  Page,
  Path,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { Block, Inline } from "../src/lib/markdown";
import { parseMarkdown, tableOfContents } from "../src/lib/markdown";
import {
  APP_HOST,
  APP_NAME,
  APP_TAGLINE,
  OPERATOR,
  SUPPORT_EMAIL,
} from "../src/lib/constants";

/**
 * `docs/COORDINATOR_GUIDE.md` as a printed booklet.
 *
 * An authoring tool, run by hand, in the same category as
 * `scripts/generate-icons.mjs`: it produces a committed artefact rather than
 * anything the running app reaches for. Nothing imports it and no route serves
 * its output — a coordinator reads the guide at `/dashboard/guide`, and this is
 * the version for the ones who want it on paper, in an email to a fellow
 * volunteer, or in a parish council's papers.
 *
 *     npx tsx scripts/generate-guide-pdf.tsx
 *
 * ## One tree, two renderers
 *
 * The whole point of this file is that it parses the guide with
 * `src/lib/markdown.ts` — the same parser `/dashboard/guide` and
 * `/dashboard/compliance` render through. There is no second reading of the
 * document and no restatement of it: `MarkdownView` turns that tree into React
 * DOM elements and the components below turn the identical tree into PDF
 * primitives, so a sentence can only ever be wrong in both places at once.
 *
 * A markdown-to-PDF dependency would have been a third grammar to keep in step
 * with the other two, and it would have accepted constructs the on-screen
 * renderer silently drops — which is how a heading that reads correctly on
 * paper turns out to be missing from the app.
 *
 * ## What it deliberately does not do
 *
 * **It renders no untrusted input.** `fileName` is a constant in this
 * repository, exactly as it is in `src/lib/docs.ts`, and the parser it shares
 * is explicitly not a general Markdown implementation.
 *
 * ## Fonts
 *
 * Helvetica, which PDFKit has built in, for the reason `src/lib/report-pdf.tsx`
 * gives: registering a font means fetching one, and this script should work on
 * a fresh clone with no network.
 */

const SOURCE = path.join("docs", "COORDINATOR_GUIDE.md");
const OUTPUT = path.join("docs", "VillageWatch-Coordinator-Guide.pdf");

/**
 * The version printed on the cover, read from `package.json` at run time.
 *
 * Read here rather than imported from `src/lib/constants.ts`, whose
 * `APP_VERSION` is filled by `next.config.ts` from the environment and is
 * therefore an empty string outside a Next build. A guide with no version on it
 * is a guide nobody can tell apart from the copy they printed in March.
 */
const { version: APP_VERSION } = createRequire(import.meta.url)(
  "../package.json",
) as { version: string };

// ---------------------------------------------------------------------------
// Page geometry and palette
// ---------------------------------------------------------------------------

/**
 * A4 with generous side margins. This is prose read end to end rather than
 * `report-pdf.tsx`'s table, so the measure matters more than the density: at
 * 64pt either side a line lands near 90 characters, which is about where a
 * reader stops losing their place between lines.
 *
 * `@react-pdf` measures in points — 72 to the inch, 2.835 to the millimetre.
 */
const PAGE = { top: 64, bottom: 64, left: 64, right: 64 } as const;

/**
 * The palette, written out as hex.
 *
 * The two brand blues are `--color-brand-600` and `--color-brand-700` from
 * `src/app/globals.css`, and everything else is the slate ramp — the same
 * duplication `report-pdf.tsx` and `opengraph-image.tsx` carry, with the same
 * failure mode of not following a change to the palette. Tailwind's custom
 * properties do not exist in a PDF.
 *
 * Colour is never the only carrier of anything here: the guide is printed in
 * black and white more often than not, so every heading level is also a
 * different size and weight.
 */
const COLOURS = {
  brand: "#2563eb",
  brandDark: "#1d4ed8",
  brandDeep: "#0f2557",
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  rule: "#e2e8f0",
  hairline: "#f1f5f9",
  panel: "#f8fafc",
  paper: "#ffffff",
} as const;

const BODY_SIZE = 10;
const LINE = 1.55;

/**
 * Hyphenation off, for `report-pdf.tsx`'s reason.
 *
 * The library's default splits on syllables, which gives "coord- inator" in a
 * narrow measure and reads as a typo rather than as a wrap. The callback
 * returns each word whole and chops only runs longer than `MAX_UNBROKEN`, which
 * here is a URL or a long identifier in backticks rather than a resident's
 * free-text landmark.
 */
const MAX_UNBROKEN = 28;

Font.registerHyphenationCallback((word) => {
  if (word.length <= MAX_UNBROKEN) return [word];

  const parts: string[] = [];
  for (let i = 0; i < word.length; i += MAX_UNBROKEN) {
    parts.push(word.slice(i, i + MAX_UNBROKEN));
  }
  return parts;
});

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE.top,
    paddingBottom: PAGE.bottom,
    paddingLeft: PAGE.left,
    paddingRight: PAGE.right,
    fontFamily: "Helvetica",
    fontSize: BODY_SIZE,
    lineHeight: LINE,
    color: COLOURS.body,
    backgroundColor: COLOURS.paper,
  },

  // Cover -------------------------------------------------------------------
  cover: {
    fontFamily: "Helvetica",
    backgroundColor: COLOURS.brandDeep,
    color: COLOURS.paper,
    paddingTop: 96,
    paddingBottom: 64,
    paddingLeft: 64,
    paddingRight: 64,
  },
  coverTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 40,
    lineHeight: 1.12,
    color: COLOURS.paper,
    marginTop: 40,
  },
  coverTagline: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "#bfdbfe",
    marginTop: 18,
    maxWidth: 330,
  },
  coverRule: {
    marginTop: 34,
    width: 64,
    height: 3,
    backgroundColor: "#60a5fa",
  },
  coverMetaLabel: {
    fontSize: 7.5,
    letterSpacing: 1.4,
    color: "#60a5fa",
    fontFamily: "Helvetica-Bold",
  },
  coverMetaValue: {
    fontSize: 10,
    color: "#dbeafe",
    marginTop: 3,
  },

  // Headings ----------------------------------------------------------------
  h1: {
    fontFamily: "Helvetica-Bold",
    fontSize: 22,
    lineHeight: 1.25,
    color: COLOURS.ink,
    marginBottom: 10,
  },
  h2: {
    fontFamily: "Helvetica-Bold",
    fontSize: 17,
    lineHeight: 1.28,
    color: COLOURS.brandDark,
    marginTop: 4,
    marginBottom: 4,
  },
  h3: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12.5,
    lineHeight: 1.35,
    color: COLOURS.ink,
    marginTop: 18,
    marginBottom: 5,
  },
  h4: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    lineHeight: 1.4,
    color: COLOURS.brandDark,
    marginTop: 14,
    marginBottom: 4,
  },
  sectionRule: {
    marginTop: 7,
    marginBottom: 12,
    height: 2,
    width: 46,
    backgroundColor: COLOURS.brand,
  },

  paragraph: { marginBottom: 9 },

  // Lists -------------------------------------------------------------------
  listItem: { flexDirection: "row", marginBottom: 5 },
  bullet: {
    width: 16,
    color: COLOURS.brand,
    fontFamily: "Helvetica-Bold",
  },
  listBody: { flex: 1 },

  // Tables ------------------------------------------------------------------
  table: {
    marginTop: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLOURS.rule,
    borderRadius: 3,
  },
  tableHeadRow: {
    flexDirection: "row",
    backgroundColor: COLOURS.panel,
    borderBottomWidth: 1,
    borderBottomColor: COLOURS.rule,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLOURS.hairline,
  },
  tableCell: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    fontSize: 8.5,
    lineHeight: 1.45,
  },

  // Quote and code ----------------------------------------------------------
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: COLOURS.brand,
    backgroundColor: COLOURS.panel,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  codeBlock: {
    backgroundColor: COLOURS.panel,
    borderWidth: 1,
    borderColor: COLOURS.rule,
    borderRadius: 3,
    padding: 10,
    marginBottom: 10,
    fontFamily: "Courier",
    fontSize: 8.5,
    lineHeight: 1.4,
    color: COLOURS.ink,
  },
  rule: {
    marginTop: 6,
    marginBottom: 16,
    height: 1,
    backgroundColor: COLOURS.rule,
  },

  // Contents ----------------------------------------------------------------
  tocColumns: { flexDirection: "row" },
  tocColumn: { width: "50%", paddingRight: 16 },
  tocSection: {
    fontFamily: "Helvetica-Bold",
    fontSize: 10.5,
    lineHeight: 1.3,
    color: COLOURS.ink,
    marginTop: 12,
    marginBottom: 2,
  },
  tocEntry: {
    fontSize: 9,
    lineHeight: 1.35,
    color: COLOURS.body,
    marginTop: 2.5,
    paddingLeft: 12,
  },

  footer: {
    position: "absolute",
    bottom: 30,
    left: PAGE.left,
    right: PAGE.right,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: COLOURS.faint,
  },
});

// ---------------------------------------------------------------------------
// The mark
// ---------------------------------------------------------------------------

/**
 * The shield from `src/components/logo.tsx`, at whatever size is asked for.
 *
 * The same two paths, on the same 24-unit viewbox, so the cover of the printed
 * guide carries the mark a coordinator sees in the sidebar rather than a second
 * drawing of it. The outline treatment, which is what the app uses above 48px —
 * see the icon-generator note in CLAUDE.md about which weight belongs at which
 * size.
 */
function ShieldMark({ size, color }: { size: number; color: string }) {
  return (
    <Svg viewBox="0 0 24 24" style={{ width: size, height: size }}>
      <Path
        d="M12 2.5 4.5 5.6v6.2c0 4.6 3.1 8.8 7.5 10 4.4-1.2 7.5-5.4 7.5-10V5.6L12 2.5Z"
        stroke={color}
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <Path d="M8.4 12.4 12 9.3l3.6 3.1v3.9H8.4v-3.9Z" fill={color} />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Inline runs
// ---------------------------------------------------------------------------

/**
 * One inline node as PDF text.
 *
 * `strong` and `em` are font swaps rather than styles, because PDFKit's
 * built-in Helvetica is four separate faces and there is no synthetic bold. A
 * link is rendered as underlined brand-coloured text and **not** as a live
 * annotation: a printed guide is the point of this file, and the guide's own
 * links are either to villagewatch.app or to a heading in the same document —
 * neither of which a reader holding a sheet of paper can follow.
 */
function renderInline(nodes: readonly Inline[], keyPrefix: string) {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;

    switch (node.kind) {
      case "text":
        return <Text key={key}>{node.value}</Text>;
      case "code":
        return (
          <Text
            key={key}
            style={{
              fontFamily: "Courier",
              fontSize: BODY_SIZE - 1.2,
              color: COLOURS.brandDark,
            }}
          >
            {node.value}
          </Text>
        );
      case "strong":
        return (
          <Text
            key={key}
            style={{ fontFamily: "Helvetica-Bold", color: COLOURS.ink }}
          >
            {renderInline(node.children, key)}
          </Text>
        );
      case "em":
        return (
          <Text key={key} style={{ fontFamily: "Helvetica-Oblique" }}>
            {renderInline(node.children, key)}
          </Text>
        );
      case "link":
        return (
          <Text key={key} style={{ color: COLOURS.brand }}>
            {renderInline(node.children, key)}
          </Text>
        );
    }
  });
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

/** Even column widths. The guide's two tables are both prose in every cell. */
function columnWidth(count: number): string {
  return `${(100 / count).toFixed(4)}%`;
}

/**
 * One block of the parsed tree.
 *
 * `break` on a level-2 heading starts each top-level section on a fresh page,
 * which is what makes the contents list worth having and what lets somebody
 * pull out "Managing incidents" and hand it to a second coordinator. Every
 * other heading carries `wrap={false}` on its group instead, so a heading never
 * ends up alone at the foot of a page.
 */
function renderBlock(block: Block, index: number, isFirstBlock: boolean) {
  const key = `b-${index}`;

  switch (block.kind) {
    case "heading": {
      if (block.level <= 1) {
        return (
          <View key={key} wrap={false}>
            <Text style={styles.h1}>{block.text}</Text>
            <View style={styles.sectionRule} />
          </View>
        );
      }

      if (block.level === 2) {
        return (
          <View key={key} break={!isFirstBlock} wrap={false}>
            <Text style={styles.h2}>{block.text}</Text>
            <View style={styles.sectionRule} />
          </View>
        );
      }

      const style = block.level === 3 ? styles.h3 : styles.h4;

      return (
        <Text key={key} style={style} wrap={false}>
          {block.text}
        </Text>
      );
    }

    case "paragraph":
      return (
        <Text key={key} style={styles.paragraph}>
          {renderInline(block.children, key)}
        </Text>
      );

    case "list":
      return (
        <View key={key} style={{ marginBottom: 9 }}>
          {block.items.map((item, i) => (
            <View key={`${key}-${i}`} style={styles.listItem} wrap={false}>
              <Text style={styles.bullet}>
                {block.ordered ? `${i + 1}.` : "•"}
              </Text>
              <Text style={styles.listBody}>
                {renderInline(item, `${key}-${i}`)}
              </Text>
            </View>
          ))}
        </View>
      );

    case "table": {
      const width = columnWidth(block.head.length);

      return (
        <View key={key} style={styles.table} wrap={false}>
          <View style={styles.tableHeadRow}>
            {block.head.map((cell, i) => (
              <Text
                key={`${key}-h-${i}`}
                style={[
                  styles.tableCell,
                  {
                    width,
                    fontFamily: "Helvetica-Bold",
                    color: COLOURS.ink,
                  },
                ]}
              >
                {renderInline(cell, `${key}-h-${i}`)}
              </Text>
            ))}
          </View>
          {block.rows.map((row, r) => (
            <View key={`${key}-r-${r}`} style={styles.tableRow}>
              {row.map((cell, c) => (
                <Text
                  key={`${key}-r-${r}-${c}`}
                  style={[styles.tableCell, { width }]}
                >
                  {renderInline(cell, `${key}-r-${r}-${c}`)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      );
    }

    case "quote":
      return (
        <View key={key} style={styles.quote} wrap={false}>
          {block.blocks.map((inner, i) => renderBlock(inner, i, false))}
        </View>
      );

    case "code":
      return (
        <Text key={key} style={styles.codeBlock}>
          {block.value}
        </Text>
      );

    case "rule":
      // The source rules separate top-level sections, and each of those already
      // starts a new page here — so the rule before one would be a stray line
      // ruling off the bottom of a page with nothing under it. `renderBlock`
      // is only reached for a rule that is *not* in that position; see the
      // filter in `Guide`.
      return <View key={key} style={styles.rule} />;
  }
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

function Cover({ printed }: { printed: string }) {
  return (
    <Page size="A4" style={styles.cover}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <ShieldMark size={34} color={COLOURS.paper} />
        <Text
          style={{
            fontFamily: "Helvetica-Bold",
            fontSize: 17,
            color: COLOURS.paper,
            marginLeft: 10,
            letterSpacing: 0.2,
          }}
        >
          {APP_NAME}
        </Text>
      </View>

      <Text style={styles.coverTitle}>The Coordinator{"\n"}Guide</Text>
      <View style={styles.coverRule} />

      <Text style={styles.coverTagline}>
        Everything you need to run {APP_NAME} for your village. No technical
        knowledge is assumed.
      </Text>

      <View style={{ flexGrow: 1 }} />

      <View style={{ flexDirection: "row" }}>
        <View style={{ width: "34%" }}>
          <Text style={styles.coverMetaLabel}>VERSION</Text>
          <Text style={styles.coverMetaValue}>v{APP_VERSION}</Text>
        </View>
        <View style={{ width: "34%" }}>
          <Text style={styles.coverMetaLabel}>PRINTED</Text>
          <Text style={styles.coverMetaValue}>{printed}</Text>
        </View>
        <View style={{ width: "32%" }}>
          <Text style={styles.coverMetaLabel}>QUESTIONS</Text>
          <Text style={styles.coverMetaValue}>{SUPPORT_EMAIL}</Text>
        </View>
      </View>

      <View
        style={{
          marginTop: 26,
          paddingTop: 14,
          borderTopWidth: 1,
          borderTopColor: "#1e40af",
        }}
      >
        <Text style={{ fontSize: 8, color: "#93c5fd", lineHeight: 1.5 }}>
          {APP_TAGLINE} · {APP_HOST} · Operated by {OPERATOR.name}. This guide
          describes how the software behaves; it is not legal advice. The
          documents your village accepts on the compliance screen are the ones
          that bind it.
        </Text>
      </View>
    </Page>
  );
}

type TocEntry = { id: string; title: string; level: number };

/**
 * Where to cut the contents into two columns.
 *
 * The nearest level-2 heading to the midpoint, never a level-3 one — a section
 * whose first two subsections are at the foot of one column and the rest at the
 * head of the next reads as two sections with the same name. Falls back to the
 * plain midpoint for a document with no sections to cut at, which this one is
 * not and a future one might be.
 */
function splitPoint(entries: readonly TocEntry[]): number {
  const mid = Math.ceil(entries.length / 2);

  let best = -1;
  entries.forEach((entry, index) => {
    if (entry.level !== 2 || index === 0) return;
    if (best === -1 || Math.abs(index - mid) < Math.abs(best - mid)) {
      best = index;
    }
  });

  return best === -1 ? mid : best;
}

function TocColumn({ entries }: { entries: readonly TocEntry[] }) {
  return (
    <View style={styles.tocColumn}>
      {entries.map((entry, i) =>
        entry.level === 2 ? (
          <Text key={`toc-${entry.id}-${i}`} style={styles.tocSection}>
            {entry.title}
          </Text>
        ) : (
          <Text key={`toc-${entry.id}-${i}`} style={styles.tocEntry}>
            {entry.title}
          </Text>
        ),
      )}
    </View>
  );
}

/**
 * The contents, in two columns and on one page.
 *
 * By section rather than by page number, because this document carries no page
 * numbers — see the footer note in `Guide` for why. Two columns is what keeps
 * it to a single opening: in one column the same list runs a page and a third,
 * and a contents page whose own tail is overleaf is worse than no contents
 * page.
 *
 * Level 4 headings are left out. They are the two halves of the compliance
 * step, and listing them would put "Either way" in a contents list on its own.
 */
function Contents({ entries }: { entries: readonly TocEntry[] }) {
  const listed = entries.filter((entry) => entry.level <= 3);
  const cut = splitPoint(listed);

  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.h1}>Contents</Text>
      <View style={styles.sectionRule} />

      <View style={styles.tocColumns}>
        <TocColumn entries={listed.slice(0, cut)} />
        <TocColumn entries={listed.slice(cut)} />
      </View>

      <View
        style={{
          marginTop: 28,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: COLOURS.rule,
        }}
      >
        <Text style={{ fontSize: 8.5, lineHeight: 1.5, color: COLOURS.muted }}>
          The live copy of this guide is always on screen at {APP_HOST}
          /dashboard/guide. Print this one for the parish papers or for a fellow
          volunteer, and check the date on the cover against the screen before
          you rely on a detail. Each section starts on a new page, so a single
          section can be pulled out and handed to somebody on its own.
        </Text>
      </View>
    </Page>
  );
}

function Guide({ blocks, printed }: { blocks: Block[]; printed: string }) {
  const entries = tableOfContents(blocks);

  // The cover carries the title, so the document's own H1 would be a second one
  // on the first body page.
  const body = blocks.filter(
    (block) => !(block.kind === "heading" && block.level === 1),
  );

  // A rule immediately before a section is the source separating two sections,
  // and here the page break already does that — drawn, it would rule off the
  // foot of a page with nothing under it. Rules anywhere else are kept.
  const drawn = body.filter((block, index) => {
    if (block.kind !== "rule") return true;
    const next = body[index + 1];
    return !(next && next.kind === "heading" && next.level === 2);
  });

  // The first blocks are the guide's opening paragraphs; the first level-2
  // heading after them must not force a page break onto an otherwise empty
  // page. Indexed against `drawn` rather than `body`, because that is the array
  // the index below is compared with — the two differ by every dropped rule.
  const firstHeading = drawn.findIndex(
    (block) => block.kind === "heading" && block.level === 2,
  );

  return (
    <Document
      title={`${APP_NAME} Coordinator Guide`}
      author={OPERATOR.name}
      subject={`How to run ${APP_NAME} for your village`}
      creator={APP_NAME}
      producer={APP_NAME}
    >
      <Cover printed={printed} />
      <Contents entries={entries} />

      <Page size="A4" style={styles.page}>
        {/*
          One fixed footer and no dynamic `render` node anywhere in it. That
          pairing — a `render` callback beside an absolutely positioned `fixed`
          element — is what corrupts the layout of a long document past about
          eight pages, and this one is forty. `report-pdf.tsx` documents the
          same trade and made the same choice: the line every page is entitled
          to carry, and no page numbers. The contents list is by section rather
          than by page for exactly that reason.
        */}
        <View style={styles.footer} fixed>
          <Text>
            {APP_NAME} Coordinator Guide · v{APP_VERSION}
          </Text>
          <Text>{SUPPORT_EMAIL}</Text>
        </View>

        {drawn.map((block, index) =>
          renderBlock(block, index, index <= firstHeading),
        )}
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

async function main() {
  const raw = await readFile(path.join(process.cwd(), SOURCE), "utf8");
  const blocks = parseMarkdown(raw);

  if (blocks.length === 0) {
    throw new Error(`${SOURCE} parsed to nothing. Is the file empty?`);
  }

  const printed = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/London",
  }).format(new Date());

  const buffer = await renderToBuffer(
    <Guide blocks={blocks} printed={printed} />,
  );

  await writeFile(path.join(process.cwd(), OUTPUT), buffer);

  console.log(
    "%s → %s (%s blocks, %s KB)",
    SOURCE,
    OUTPUT,
    blocks.length,
    Math.round(buffer.byteLength / 1024),
  );
}

main().catch((cause) => {
  console.error("Could not build the guide PDF", cause);
  process.exitCode = 1;
});
