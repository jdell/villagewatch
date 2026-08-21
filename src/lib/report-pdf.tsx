import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { CommunityReportData } from "@/lib/community-report";
import {
  AI_ANALYSIS_NOTE,
  GENERATED_BY,
  rangeDays,
  reportFileName,
} from "@/lib/community-report";
import {
  APP_NAME,
  INCIDENT_TYPE_LABELS,
  REPORT_DESCRIPTION_MAX_CHARS,
  SEVERITY_LABELS,
  SEVERITY_PIN_COLORS,
} from "@/lib/constants";
import { truncateWords } from "@/lib/format-alert";
import { formatDate, formatDateTime } from "@/lib/format";

/**
 * The community safety report as a PDF file.
 *
 * **Server only.** `@react-pdf/renderer` pulls in a fork of PDFKit and is
 * listed in `serverExternalPackages` — importing it from a Client Component
 * would put a PDF engine in a resident's browser to render a document only a
 * coordinator can ask for.
 *
 * ## Why this exists when a browser can already print to PDF
 *
 * `ReportView` used to carry a "Print or save as PDF" button beside this one,
 * and it was the right button for a coordinator who wanted exactly what was in
 * front of them. What the browser's print dialogue cannot do is produce the
 * same file twice: the page size, the margins, whether headers and footers are
 * printed and whether background colours survive are all the recipient's own
 * browser settings, so the monthly report to the same PCSO looked different
 * every month and on a phone often arrived with the app's chrome in it. This is
 * rendered server-side, so the file is identical whoever presses the button —
 * and it is a URL, which is what a scheduled monthly send would eventually
 * need. Two buttons handing a PCSO two different PDFs was the worse failure, so
 * this is now the only one; Ctrl+P still works and nothing points at it.
 *
 * ## The pattern analysis, and where its prose comes from
 *
 * The document always has the section. What fills it is `narrative`, and the
 * route decides: `countedNarrative` by default, and the model only when the
 * caller asks with `?analysis=ai`. That split is the whole reason this takes a
 * `narrative` rather than reaching for one itself — a file download is the
 * worst possible trigger for an Anthropic call, because a browser re-requests
 * one on a refresh, a retry or a preview pane, and each of those would be
 * another call and another bill.
 *
 * `source` is rendered on the page. A summary written by a model and a summary
 * assembled from counts read very differently to an officer deciding whether to
 * act on it, and the document says which one it is carrying.
 *
 * ## What may be in it
 *
 * Exactly what `formatCommunityReport` may carry, and for the same reasons.
 * `ReportIncident` has no field for `rawDescription`, `lat` or `lng` (domain
 * rule 1, domain rule 2), so there is nowhere in the components below to put
 * one — and a PDF is the most forwardable thing this app produces. The footer
 * disclaimer is not decoration either: a recipient outside the village has no
 * other way to know the descriptions were rewritten, that the locations are
 * landmarks rather than addresses, or who to take a UK GDPR question to.
 *
 * ## Fonts
 *
 * Helvetica, which PDFKit has built in. Registering a font means fetching one,
 * and a network call on the path of a document a coordinator is waiting for is
 * a failure mode bought for a nicer typeface — the same call
 * `opengraph-image.tsx` makes about `next/og`.
 */

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

/**
 * A4 at 10mm side margins, which is where `@media print` in `globals.css` puts
 * the printed web view. `@react-pdf` measures in points: 15mm ≈ 42.5pt and
 * 10mm ≈ 28.3pt.
 */
const PAGE_PADDING = { top: 42.5, bottom: 56, left: 28.3, right: 28.3 };

/** Point size the body text sits at. Small, because the log is a table. */
const BODY_SIZE = 8.5;

/**
 * The palette, written out as hex.
 *
 * `brand` is the same blue as `--color-brand-600` and `--color-brand-700` in
 * `globals.css`, and the severity dots in the log are `SEVERITY_PIN_COLORS` —
 * the colours the map pins already use, so a coordinator reading a printed log
 * and a resident reading the map are reading the same scale. Tailwind's custom
 * properties do not exist in a PDF, so the two brand blues are duplicated here;
 * that is the same duplication `opengraph-image.tsx` carries, and it has the
 * same failure mode of not following a change to the palette. Everything else
 * is the slate ramp.
 *
 * Colour is used sparingly and never as the only carrier of anything: the
 * severity column says "High" beside its dot, because this document is printed
 * in black and white more often than not.
 */
const COLOURS = {
  brand: "#2563eb",
  brandDark: "#1d4ed8",
  ink: "#0f172a",
  body: "#334155",
  muted: "#64748b",
  faint: "#94a3b8",
  rule: "#e2e8f0",
  hairline: "#f1f5f9",
  panel: "#f8fafc",
} as const;

/**
 * The incident log's columns.
 *
 * The widths are the percentages the printed web view uses — see the `print:w-`
 * utilities on each `<th>` in `src/components/reports/report-view.tsx`. They are
 * the same numbers on purpose: a coordinator who prints the page one month and
 * downloads the PDF the next should not get two differently proportioned
 * documents. Five of the six columns carry a timestamp, a code or an enum label
 * and none of those grows; the sixth carries free text and takes what is left.
 *
 * `@react-pdf` lays a row out as a flex row of fixed-width cells, so a cell's
 * text wraps inside its own column rather than pushing the row wider — which is
 * the property `table-layout: fixed` buys on the web side. They total 100 and
 * `tests/report-pdf.test.ts` asserts it: a set that summed to more would not
 * error, it would silently squeeze the description column on every page.
 *
 * **A column narrower than its widest fixed content overflows in silence.** The
 * first set of these was the web view's, and two of them were too tight for a
 * PDF's own metrics: a reference is `VW-HIS-2026-0003`, sixteen Courier
 * characters and therefore 0.6em each, which needs about 68pt and had 53 —
 * so every row in the log printed its reference straight over the top of the
 * category beside it. `REFERENCE_SIZE` and the 14% here are measured against
 * that string rather than eyeballed, and `WHEN` was widened for the same reason
 * (`28 Jul 2026, 03:30` at `BODY_SIZE`). The web view took both changes with
 * them. Nothing in this file wraps a run with no space in it, so a column that
 * has to hold one has to be wide enough for it.
 */
export const LOG_COLUMNS = [
  { key: "when", label: "When", width: "15%" },
  { key: "reference", label: "Reference", width: "14%" },
  { key: "category", label: "Category", width: "12%" },
  { key: "severity", label: "Severity", width: "9%" },
  { key: "location", label: "Location", width: "14%" },
  { key: "report", label: "Report", width: "36%" },
] as const satisfies readonly { key: string; label: string; width: string }[];

/**
 * Courier, sized so a full reference fits its column on one line.
 *
 * Monospaced deliberately: a reference is read out over the phone and typed
 * into somebody else's system, and a proportional font is where `1` and `l`
 * stop being distinguishable.
 */
const REFERENCE_SIZE = 7;

/**
 * Words are never broken with a hyphen. They wrap whole, or they are cut.
 *
 * `@react-pdf`'s default hyphenation splits on syllables, which in a 12%-wide
 * column turns "Antisocial behaviour" into "Antisocial be- / haviour" and
 * "Suspicious activity" into "Suspicious ac- / tivity". In a document a police
 * officer skims down, a hyphen inside a category label reads as a different
 * category — and it never helped the case it was there for, because it declines
 * to split `VW-HIS-2026-0003` at all.
 *
 * So the callback returns each word whole, and chops only the runs no column
 * could hold. `MAX_UNBROKEN` is a little under what the narrowest free-text
 * column fits, so ordinary English — the longest label here is "Neighbourhood",
 * at thirteen — is never touched, and a resident who types a forty-character
 * run into the location field gets it wrapped rather than printed across the
 * column beside it.
 *
 * Registered at module scope because the font store is global to the process.
 * It is set once by the only module in the app that renders a PDF.
 */
const MAX_UNBROKEN = 16;

Font.registerHyphenationCallback((word) => {
  if (word.length <= MAX_UNBROKEN) return [word];

  const parts: string[] = [];
  for (let at = 0; at < word.length; at += MAX_UNBROKEN) {
    parts.push(word.slice(at, at + MAX_UNBROKEN));
  }

  return parts;
});

const styles = StyleSheet.create({
  page: {
    paddingTop: PAGE_PADDING.top,
    paddingBottom: PAGE_PADDING.bottom,
    paddingLeft: PAGE_PADDING.left,
    paddingRight: PAGE_PADDING.right,
    fontFamily: "Helvetica",
    fontSize: BODY_SIZE,
    color: COLOURS.body,
    lineHeight: 1.45,
  },

  // Header ------------------------------------------------------------------
  eyebrow: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7,
    letterSpacing: 1.2,
    color: COLOURS.brandDark,
  },
  /**
   * The village's name, and the one place on the page `lineHeight` is set.
   *
   * The page's 1.45 is right for 8.5pt body text and wrong here: @react-pdf
   * puts the extra leading *above* the baseline, so an 18pt heading in a 26pt
   * box sits on the floor of it with its descenders past the edge — the "p" and
   * "g" of "Histon & Impington" printed straight through the date line under
   * it. 1.2 is a heading's own leading, and `headerMeta` below carries the gap
   * as a margin instead, where it is visible to whoever changes it next.
   */
  villageName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    lineHeight: 1.2,
    color: COLOURS.ink,
    marginTop: 4,
  },
  headerMeta: { fontSize: 9, color: COLOURS.body, marginTop: 5 },
  headerStamp: { fontSize: 7.5, color: COLOURS.muted, marginTop: 1 },
  /** The one heavy rule on the page, in brand blue. It reads as a masthead. */
  headerRule: {
    borderBottomWidth: 2,
    borderBottomColor: COLOURS.brand,
    marginTop: 10,
    marginBottom: 4,
  },

  // Sections ----------------------------------------------------------------
  section: { marginTop: 14 },
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 7.5,
    letterSpacing: 1.2,
    color: COLOURS.brandDark,
    borderBottomWidth: 1,
    borderBottomColor: COLOURS.rule,
    paddingBottom: 3,
    marginBottom: 5,
  },
  lead: { fontSize: 9.5, color: COLOURS.body },
  strong: { fontFamily: "Helvetica-Bold", color: COLOURS.ink },
  note: { fontSize: 7.5, color: COLOURS.muted, marginTop: 5 },

  // Pattern analysis --------------------------------------------------------
  analysis: {
    backgroundColor: COLOURS.panel,
    borderLeftWidth: 2,
    borderLeftColor: COLOURS.brand,
    paddingVertical: 7,
    paddingHorizontal: 9,
  },
  analysisBullet: { flexDirection: "row", gap: 5, marginTop: 4 },
  analysisDash: { color: COLOURS.faint },
  analysisText: { flex: 1, color: COLOURS.body },
  provenance: { fontSize: 7, color: COLOURS.muted, marginTop: 7 },

  // Breakdowns --------------------------------------------------------------
  columns: { flexDirection: "row", gap: 24, marginTop: 10 },
  column: { flex: 1 },
  columnHeading: {
    fontFamily: "Helvetica-Bold",
    fontSize: 9,
    color: COLOURS.ink,
    marginBottom: 4,
  },
  countRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 1.5,
  },
  countLabel: { flex: 1, color: COLOURS.body },
  countValue: { fontFamily: "Helvetica-Bold", color: COLOURS.ink },

  // Hotspots ----------------------------------------------------------------
  hotspotRow: { flexDirection: "row", gap: 6, paddingVertical: 1.5 },
  hotspotIndex: { width: 12, color: COLOURS.faint },
  hotspotName: { flex: 1, color: COLOURS.body },
  hotspotCount: { color: COLOURS.body },

  // The log -----------------------------------------------------------------
  logHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLOURS.brand,
    paddingBottom: 4,
  },
  logHeadCell: {
    fontFamily: "Helvetica-Bold",
    fontSize: 6.5,
    letterSpacing: 0.8,
    color: COLOURS.brandDark,
    paddingRight: 6,
  },
  logRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLOURS.hairline,
    paddingTop: 5,
    paddingBottom: 5,
  },
  logCell: { paddingRight: 6, color: COLOURS.body },
  /**
   * The severity dot, in the same `SEVERITY_PIN_COLORS` hue as the map pin.
   *
   * It sits *beside* the word rather than replacing it. Colour is the fastest
   * thing to scan down a column and the first thing a photocopier loses, and
   * this document is read on paper more often than on a screen.
   */
  severityCell: {
    flexDirection: "row",
    alignItems: "center",
    // Hugs the top of the row rather than stretching to its height. A flex item
    // is stretched on the cross axis by default, and `alignItems: center` then
    // centres the dot and the word inside a box as tall as the longest
    // description in the row — so "Low" floated four lines below the timestamp
    // it belongs to. `alignItems` is still centre, but now it is centring the
    // dot against the word rather than the cell against the row.
    alignSelf: "flex-start",
    gap: 3,
  },
  severityDot: { width: 4, height: 4, borderRadius: 2 },
  logTitle: { fontFamily: "Helvetica-Bold", color: COLOURS.ink },
  logDescription: { marginTop: 1, color: COLOURS.body },
  logPattern: { marginTop: 1, fontSize: 7.5, color: COLOURS.muted },

  // Footer ------------------------------------------------------------------
  footer: {
    position: "absolute",
    bottom: 20,
    left: PAGE_PADDING.left,
    right: PAGE_PADDING.right,
    borderTopWidth: 1,
    borderTopColor: COLOURS.rule,
    paddingTop: 5,
  },
  footerText: { fontSize: 6.5, color: COLOURS.muted, lineHeight: 1.4 },
});

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section} wrap={false}>
      <Text style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function CountTable({
  heading,
  rows,
}: {
  heading: string;
  rows: readonly { label: string; count: number }[];
}) {
  return (
    <View style={styles.column}>
      <Text style={styles.columnHeading}>{heading}</Text>
      {rows.length === 0 ? (
        <Text style={{ color: COLOURS.muted }}>None.</Text>
      ) : (
        rows.map((row) => (
          <View key={row.label} style={styles.countRow}>
            <Text style={styles.countLabel}>{row.label}</Text>
            <Text style={styles.countValue}>{row.count}</Text>
          </View>
        ))
      )}
    </View>
  );
}

/**
 * The column headings, repeated at the top of every page the log runs onto.
 *
 * `fixed` is what repeats them. Without it a log spilling onto page three has
 * six unlabelled columns on it, and the reader has to page back to find out
 * which one is the reference — the same job `thead { display: table-header-group }`
 * does for the printed web view.
 */
function LogHeader() {
  return (
    <View style={styles.logHead} fixed>
      {LOG_COLUMNS.map((column) => (
        <Text
          key={column.key}
          style={[styles.logHeadCell, { width: column.width }]}
        >
          {column.label.toUpperCase()}
        </Text>
      ))}
    </View>
  );
}

function LogRow({
  incident,
}: {
  incident: CommunityReportData["incidents"][number];
}) {
  const [when, reference, category, severity, location, report] = LOG_COLUMNS;

  return (
    /*
      `wrap={false}` keeps one report on one page. A row split across a page
      break puts a reference at the foot of one sheet and the description it
      belongs to at the head of the next, which in a document a police officer
      reads line by line is worse than the whitespace it costs. The log itself
      wraps freely — see the `allowBreak` note in `report-view.tsx` for why a
      section that cannot fit on a page must never be told not to break.
    */
    <View style={styles.logRow} wrap={false}>
      <Text style={[styles.logCell, { width: when.width }]}>
        {formatDateTime(incident.occurredAt)}
      </Text>
      <Text
        style={[
          styles.logCell,
          {
            width: reference.width,
            fontFamily: "Courier",
            fontSize: REFERENCE_SIZE,
          },
        ]}
      >
        {incident.reference}
      </Text>
      <Text style={[styles.logCell, { width: category.width }]}>
        {INCIDENT_TYPE_LABELS[incident.type]}
      </Text>
      <View style={[styles.logCell, styles.severityCell, { width: severity.width }]}>
        <View
          style={[
            styles.severityDot,
            { backgroundColor: SEVERITY_PIN_COLORS[incident.severity] },
          ]}
        />
        <Text>{SEVERITY_LABELS[incident.severity]}</Text>
      </View>
      <Text style={[styles.logCell, { width: location.width }]}>
        {incident.locationText?.trim() || "—"}
      </Text>
      <View style={[styles.logCell, { width: report.width }]}>
        <Text style={styles.logTitle}>{incident.title.trim()}</Text>
        <Text style={styles.logDescription}>
          {truncateWords(
            incident.description.trim().replace(/\s+/g, " "),
            REPORT_DESCRIPTION_MAX_CHARS,
          )}
        </Text>
        {incident.recurring && incident.patternNote?.trim() && (
          <Text style={styles.logPattern}>
            Pattern: {incident.patternNote.trim()}
          </Text>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

/** "The preceding 7 days saw 9." — or the honest absence of a comparison. */
function trendSentence(total: number, previous: number, days: number): string {
  const period = `preceding ${days} day${days === 1 ? "" : "s"}`;

  if (previous === 0) {
    return `There is no comparable figure for the ${period}.`;
  }

  return `The ${period} saw ${previous}.`;
}

export function CommunityReportDocument({
  report,
}: {
  report: CommunityReportData;
}) {
  const days = rangeDays(report.from, report.to);

  return (
    <Document
      title={`Community Safety Report — ${report.villageName}`}
      author={APP_NAME}
      subject={`${formatDate(report.from)} to ${formatDate(report.to)}`}
      creator={APP_NAME}
      producer={APP_NAME}
    >
      <Page size="A4" style={styles.page}>
        <View>
          <Text style={styles.eyebrow}>
            {APP_NAME.toUpperCase()} · COMMUNITY SAFETY REPORT
          </Text>
          <Text style={styles.villageName}>{report.villageName}</Text>
          <Text style={styles.headerMeta}>
            {formatDate(report.from)} to {formatDate(report.to)} ({days} day
            {days === 1 ? "" : "s"})
          </Text>
          <Text style={styles.headerStamp}>
            Generated {formatDateTime(report.generatedAt)}
          </Text>
          <View style={styles.headerRule} />
        </View>

        <Section title="Summary">
          <Text style={styles.lead}>
            <Text style={styles.strong}>
              {report.total} report{report.total === 1 ? "" : "s"}
            </Text>{" "}
            published in this period.{" "}
            {trendSentence(report.total, report.previousTotal, days)}
          </Text>

          <View style={styles.columns}>
            <CountTable
              heading="By category"
              rows={report.byType.map((row) => ({
                label: INCIDENT_TYPE_LABELS[row.key],
                count: row.count,
              }))}
            />
            <CountTable
              heading="By severity"
              rows={report.bySeverity.map((row) => ({
                label: SEVERITY_LABELS[row.key],
                count: row.count,
              }))}
            />
          </View>
        </Section>

        <Section title="Hotspots">
          {report.hotspots.length === 0 ? (
            <Text style={{ color: COLOURS.body }}>
              No location was named more than once in this period.
            </Text>
          ) : (
            <>
              {report.hotspots.map((spot, index) => (
                <View key={spot.location} style={styles.hotspotRow}>
                  <Text style={styles.hotspotIndex}>{index + 1}.</Text>
                  <Text style={styles.hotspotName}>{spot.location}</Text>
                  <Text style={styles.hotspotCount}>
                    {spot.count} report{spot.count === 1 ? "" : "s"}
                  </Text>
                </View>
              ))}
              <Text style={styles.note}>
                Grouped by the landmark residents typed, so wording varies
                between reports.
              </Text>
            </>
          )}
        </Section>

        {/*
          The analysis the route asked for. `narrative` is never null on this
          path — `countedNarrative` is the floor — but the branch stays, because
          the type allows it and a heading with nothing under it reads, in a
          document handed to a police officer, as a section that failed rather
          than one nobody asked for.

          `source` is on the page rather than in a comment: a summary written by
          a model and a summary assembled from counts read very differently to
          somebody deciding whether to act on it, and this is the one section of
          the document that is not a number counted from the database.
        */}
        <Section title="Pattern analysis">
          {!report.narrative ? (
            <Text style={{ color: COLOURS.body }}>
              No analysis was generated for this report. The figures above and
              the log below are counted directly from the reports.
            </Text>
          ) : (
            <View style={styles.analysis}>
              <Text style={{ color: COLOURS.body }}>
                {report.narrative.summary.trim()}
              </Text>

              {report.narrative.patterns.map((note) => (
                <View key={note} style={styles.analysisBullet}>
                  <Text style={styles.analysisDash}>—</Text>
                  <Text style={styles.analysisText}>{note.trim()}</Text>
                </View>
              ))}

              {report.narrative.recommendation?.trim() && (
                <Text style={{ color: COLOURS.body, marginTop: 6 }}>
                  <Text style={styles.strong}>Suggested focus: </Text>
                  {report.narrative.recommendation.trim()}
                </Text>
              )}

              <Text style={styles.provenance}>
                {report.narrative.source === "ai"
                  ? `Written by ${report.narrative.model ?? "an AI model"} from the reports listed below. It reflects what was reported, not a police assessment.`
                  : "Assembled from the counts above. No AI summary was available when this report was produced."}
              </Text>
            </View>
          )}
        </Section>

        {/*
          The log is the one section allowed to run past a page, so it is not
          wrapped in `Section` — that component sets `wrap={false}`, which on a
          box taller than a page is a request no layout engine can honour.
        */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>INCIDENT LOG</Text>

          {report.incidents.length === 0 ? (
            <Text style={{ color: COLOURS.body }}>
              Nothing was published in this village during the period.
            </Text>
          ) : (
            <>
              <LogHeader />
              {report.incidents.map((incident) => (
                <LogRow key={incident.id} incident={incident} />
              ))}

              {report.omitted > 0 && (
                <Text style={styles.note}>
                  {report.omitted} further report
                  {report.omitted === 1 ? "" : "s"} in this period{" "}
                  {report.omitted === 1 ? "is" : "are"} not listed. The counts,
                  breakdowns and hotspots above cover the whole period — narrow
                  the dates to see the rest.
                </Text>
              )}
            </>
          )}
        </View>

        {/*
          `fixed` puts the disclaimer on every page, which is the point of it:
          a PDF gets forwarded a page at a time, printed double-sided and
          scanned back in, and a sheet of an incident log with no statement that
          the locations are approximate is a sheet that reads as a police log.

          **There is no page number beside it, and that is a choice this
          library forces.** `render={({ pageNumber, totalPages }) => …}` is how
          @react-pdf does "Page 2 of 5", and a page carrying both a dynamic node
          and an absolutely positioned `fixed` one corrupts its own layout once
          the document runs past about eight pages: `splitPage` re-runs
          `resolveDynamicPage` — a full relayout — on every split, and what
          comes out the far side is a transform of -2.9e+22 and a throw from
          inside PDFKit. It is not a rendering artefact that could be lived
          with; it is a failed download, and only for the villages with enough
          reports to need the page numbers.

          Either feature works alone. Between a disclaimer on every sheet and a
          number on every sheet, the disclaimer is the one a recipient is
          entitled to, so the numbers went. `tests/report-pdf.test.ts` renders a
          200-row log, which is what makes this a test failure rather than a
          discovery — the shape is tempting, it is what the library's own
          examples show, and it works on every report short enough to try by
          hand.
        */}
        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            {/*
              The AI sentence is here only when a model wrote the analysis —
              see `footer()` in `src/lib/community-report.ts`. A counted
              narrative is arithmetic, and this is the line a recipient reads
              to decide how much of the document to trust.
            */}
            {GENERATED_BY}
            {report.narrative?.source === "ai" ? ` ${AI_ANALYSIS_NOTE}` : ""}{" "}
            Data controller: {report.dataController}.
            Descriptions are anonymised before publication — personal details,
            names and registrations are removed. Locations are the landmark a
            resident named, not an address, and mapped positions are deliberately
            offset. Reports are what residents said they saw; they are not
            verified crime records.
          </Text>
        </View>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export const PDF_CONTENT_TYPE = "application/pdf";

/** `villagewatch-report-histon-2026-07-01-to-2026-07-31.pdf`. */
export function pdfFilename(report: {
  villageName: string;
  from: Date | string | number;
  to: Date | string | number;
}): string {
  return `${reportFileName(report)}.pdf`;
}

/**
 * The finished file, as bytes.
 *
 * **Rendered whole before a single byte goes out**, rather than piped from
 * `renderToStream`. Once a response has started streaming its status is spent,
 * and a failure halfway through the log would arrive at the browser as a
 * truncated PDF under the report's own filename — the exact failure the CSV
 * export was fixed for, where `download` saved whatever turned up and left a
 * coordinator with a corrupt file and nothing on screen to explain it. Building
 * first keeps every failure a JSON body with a status code the button can read.
 * A capped log (`REPORT_MAX_INCIDENTS`) is what makes that affordable.
 */
export async function renderReportPdf(
  report: CommunityReportData,
): Promise<Buffer> {
  return renderToBuffer(<CommunityReportDocument report={report} />);
}
