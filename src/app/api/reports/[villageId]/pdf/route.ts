import { NextResponse, type NextRequest } from "next/server";
import { generateReportNarrative } from "@/lib/ai/report-narrative";
import { getSession } from "@/lib/auth";
import type {
  CommunityReportData,
  ReportNarrative,
} from "@/lib/community-report";
import { isCoordinatorRole, type VillageMode } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { RATE_LIMITS, rateLimit } from "@/lib/rate-limit";
import { PDF_CONTENT_TYPE, pdfFilename, renderReportPdf } from "@/lib/report-pdf";
import {
  collectVillageReport,
  countedNarrative,
  resolveReportRange,
} from "@/lib/reports";
import { getVillageController, getVillageMode } from "@/lib/villages";

/**
 * GET /api/reports/[villageId]/pdf — the community safety report as a file.
 *
 * The same document `/reports` renders, rendered server-side by
 * `src/lib/report-pdf.tsx` so that the file is identical whoever downloads it.
 * The period comes from the query string — `?range=30`, or `?range=custom&from=
 * …&to=…` — and is resolved by `resolveReportRange`, the same function the page
 * and the narrative action use, so a coordinator cannot be looking at one
 * period on screen and downloading another.
 *
 * ## The village id in the path decides nothing
 *
 * It is in the URL because a report is a village's document and the link should
 * say which village it is for. It is **not** how the village is chosen: the
 * village comes from the session profile, and a path id that does not match it
 * is a 403 rather than a different village's reports (domain rule 4 — never
 * trust a village id that arrived in a request). Written as a comparison rather
 * than by ignoring the segment, because a route that silently served your own
 * village whatever id you typed would look like a working access check to
 * anyone testing it.
 *
 * ## Why every exit is JSON
 *
 * `DownloadPdfButton` fetches this and inspects the status before it saves
 * anything, which only works if a failure carries a readable `error` string —
 * the reasoning is written up in full over `/api/dashboard/export`, which was
 * an `<a href download>` until a 403 arrived as a file called `export`. The PDF
 * is built whole before the response starts for the same reason; see
 * `renderReportPdf`.
 *
 * ## The pattern analysis costs money, so it is opt-in
 *
 * The document always carries the section; `countedNarrative` is what fills it
 * by default. `?analysis=ai` is the only thing that reaches Anthropic, and the
 * default is the other way round because a file download is the worst trigger
 * there is for a paid call: a browser re-requests one on a refresh, a retry, a
 * preview pane and a "save link as", and every one of those would be another
 * call and another bill. `RATE_LIMITS.reportNarrative` is the same ceiling the
 * button on `/reports` counts against, and a refusal or an outage falls back to
 * the counted summary rather than failing the download — the document is
 * complete without the prose, and it says on its face which of the two it has.
 *
 * **The prose is written here, never posted in.** A generator that printed text
 * handed to it by the browser would be a police document with a client-supplied
 * paragraph in it, whatever the screen showed at the time.
 */

/** PDFKit is a Node library. Nothing here would run on the edge. */
export const runtime = "nodejs";

/** One village's reports for a period a coordinator just picked. Never cached. */
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ villageId: string }> },
) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const villageId = session.profile?.villageId;
  const role = session.profile?.role;

  if (!villageId || !role || !isCoordinatorRole(role)) {
    return NextResponse.json(
      { error: "Only village coordinators can download a report" },
      { status: 403 },
    );
  }

  const { villageId: requested } = await params;

  if (requested !== villageId) {
    // Deliberately the same wording a non-coordinator gets. Confirming that the
    // id names a real village elsewhere in the country would make this an
    // oracle for which parishes are live, and the answer is no either way.
    return NextResponse.json(
      { error: "Only village coordinators can download a report" },
      { status: 403 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "The database is not configured on this deployment." },
      { status: 503 },
    );
  }

  try {
    const range = resolveReportRange(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    /*
      Two reads rather than one. `getVillageController` retries without
      `parish_council` on a database missing it, so a `mode` column folded into
      the same SELECT would take the controller's name down with it — see "The
      two compliance models" in CLAUDE.md.
    */
    const [village, mode] = await Promise.all([
      getVillageController(villageId),
      getVillageMode(villageId),
    ]);

    if (!village) {
      return NextResponse.json(
        { error: "That village could not be found." },
        { status: 404 },
      );
    }

    const { range: _serverOnly, ...collected } = await collectVillageReport({
      villageId,
      villageName: village.name,
      parishCouncil: village.parishCouncil,
      range,
    });
    void _serverOnly;

    /*
      Before the response and still able to fail the request, the same call
      `/api/dashboard/export` makes and for the same reason: nothing has left
      the building yet, and a village's reports assembled into a document that
      goes to the police with no trail behind it is worse than a download that
      did not work. `incident.report_generated` is the action the narrative
      button already writes — producing the document is the act it records, and
      a PDF is the document. `format` is what tells the two apart in the viewer.
    */
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorRole: role,
        villageId,
        action: "incident.report_generated",
        entityType: "village",
        entityId: villageId,
        after: {
          format: "pdf",
          from: range.from.toISOString(),
          to: range.to.toISOString(),
          days: range.days,
          incidents: collected.total,
        },
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      },
    });

    const pdf = await renderReportPdf({
      ...collected,
      narrative: await narrativeFor(collected, {
        wantsAi: request.nextUrl.searchParams.get("analysis") === "ai",
        userId: session.user.id,
        villageName: village.name,
        mode,
        days: range.days,
      }),
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": PDF_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${pdfFilename(collected)}"`,
        "Content-Length": String(pdf.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    // With the village on it, because the two ways this realistically fails —
    // an unreachable database and a layout the renderer choked on — need the
    // server log to tell them apart, and neither should reach a coordinator as
    // a downloaded stack trace.
    console.error("PDF report failed for village %s", villageId, cause);

    return NextResponse.json(
      { error: "The report could not be built. Try again in a moment." },
      { status: 500 },
    );
  }
}

/**
 * What fills the document's pattern-analysis section.
 *
 * **Counted unless the caller asked for the model.** Every other section of the
 * report is a database query; this one is an Anthropic call over a month of a
 * village's reports, and a file download is the worst possible thing to hang
 * one on — a browser re-requests a download on a refresh, a retry or a preview
 * pane, and each of those would be a fresh call and a fresh bill for prose
 * nobody read. So the default is `countedNarrative`, which costs nothing, is
 * the same summary the on-screen report falls back to, and says on the page
 * that it was assembled from counts.
 *
 * `?analysis=ai` is the opt-in, and `DownloadPdfButton` sets it only once the
 * coordinator has generated an analysis on screen — so the call is spent for
 * somebody who has already decided they want the prose. It is written fresh
 * rather than carried over from the page, because a GET route cannot see that
 * component's state and a document generator that took its text from the client
 * is not a thing to build for a file addressed to the police. Same model, same
 * reports, same prompt; the wording can differ from the screen, and `source` on
 * the document is what tells a reader which kind of summary they are holding.
 *
 * **Never throws and never returns null.** A refused rate limit, an unreachable
 * model and a missing key all fall back to the counted summary, for the reason
 * `/reports` gives at length: inventing prose to fill the gap would make an
 * outage look like a working report to an officer with no way to tell.
 */
async function narrativeFor(
  collected: Omit<CommunityReportData, "narrative">,
  options: {
    wantsAi: boolean;
    userId: string;
    villageName: string;
    /** Who the prompt says is reading. The document is identical either way. */
    mode: VillageMode;
    days: number;
  },
): Promise<ReportNarrative> {
  const counted = countedNarrative({ ...collected, days: options.days });

  // Nothing published is not a question to ask a model. `generateReportNarrative`
  // refuses it anyway; short-circuiting keeps a rate-limit slot from being spent
  // on a report with an empty log.
  if (!options.wantsAi || collected.incidents.length === 0) return counted;

  const limit = await rateLimit(RATE_LIMITS.reportNarrative, options.userId);

  if (!limit.ok) return counted;

  const result = await generateReportNarrative({
    villageName: options.villageName,
    from: new Date(collected.from),
    to: new Date(collected.to),
    mode: options.mode,
    previousPeriodCount: collected.previousTotal,
    incidents: collected.incidents.map((incident) => ({
      reference: incident.reference,
      type: incident.type,
      severity: incident.severity,
      title: incident.title,
      description: incident.description,
      locationText: incident.locationText,
      occurredAt: new Date(incident.occurredAt),
    })),
  });

  if (!result.ok) return counted;

  return {
    summary: result.data.summary,
    patterns: result.data.patterns,
    recommendation: result.data.recommendation,
    source: "ai",
    model: result.model,
  };
}
