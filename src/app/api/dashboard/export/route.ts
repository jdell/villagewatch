import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isCoordinatorRole } from "@/lib/constants";
import {
  CSV_CONTENT_TYPE,
  buildIncidentCsv,
  csvFilename,
} from "@/lib/incident-csv";

/**
 * GET /api/dashboard/export — the village's incidents as CSV.
 *
 * This is the file a coordinator takes to a parish council or police liaison
 * meeting, which is exactly why it uses `description` and not
 * `rawDescription`. A coordinator is entitled to read the reporter's verbatim
 * words one report at a time, with an `AuditLog` row for each (domain rule 1) —
 * but a spreadsheet is a different thing. It gets emailed, forwarded and left
 * on a shared drive, and once a name or a registration is in it, none of that
 * is recallable. The export carries the anonymised column only.
 *
 * The download itself is still a privileged bulk read, so it is coordinators
 * only, scoped to their own village, and it writes its own audit row.
 *
 * ## Why every exit from here is JSON
 *
 * The dashboard used to reach this with a bare `<a href download>`, and that is
 * what made a failure here indistinguishable from a failure anywhere else: a
 * 401, a 403, a 503 or an unhandled exception all arrive at the browser as a
 * response body, and `download` saves whatever arrives under the export's name.
 * A coordinator got a file called `export` containing a JSON error or a page of
 * Next's HTML, and the button had "not worked" with nothing on screen to say
 * why. `ExportCsvButton` now fetches, checks the status and reports the `error`
 * string; the `try/catch` below is what guarantees there is one to report
 * rather than an HTML error page. The formatting itself lives in
 * `src/lib/incident-csv.ts`, which is exercised by
 * `scripts/check-incident-csv.ts`.
 */

/** A year of reports is more than any meeting needs and keeps the file small. */
const EXPORT_WINDOW_DAYS = 365;

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const villageId = session.profile?.villageId;
  const role = session.profile?.role;

  if (!villageId || !role || !isCoordinatorRole(role)) {
    return NextResponse.json(
      { error: "Only village coordinators can export incidents" },
      { status: 403 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "The database is not configured on this deployment." },
      { status: 503 },
    );
  }

  const since = new Date(Date.now() - EXPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  try {
    const rows = await prisma.incident.findMany({
      // `REMOVED` is excluded, and this is the one query where saying so
      // matters. Every other read is already narrowed to a status list; this one
      // is deliberately wide, because a coordinator exporting their village's
      // reports wants the rejected and archived ones too. An erased report is
      // the exception: a spreadsheet gets emailed and forwarded, so a report a
      // resident asked to have deleted must not leave in one the day after they
      // asked (UK GDPR Article 17).
      where: {
        villageId,
        status: { not: "REMOVED" },
        occurredAt: { gte: since },
      },
      select: {
        reference: true,
        type: true,
        severity: true,
        status: true,
        // The public column. See the note at the top of this file.
        description: true,
        locationText: true,
        peopleCount: true,
        occurredAt: true,
        tags: { select: { label: true }, orderBy: { label: "asc" } },
      },
      orderBy: { occurredAt: "desc" },
    });

    // Before the response, not after it, and deliberately still able to fail the
    // request. Everywhere else in the codebase an audit write that follows a
    // completed act is swallowed, because telling somebody their action failed
    // when it succeeded would be false. This one precedes the act: nothing has
    // left the building yet, and a bulk read of a village's reports that no
    // trail records is the one outcome worse than a download that did not work.
    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorEmail: session.user.email,
        actorRole: role,
        villageId,
        action: "incident.export",
        entityType: "Village",
        entityId: villageId,
        after: { rows: rows.length, windowDays: EXPORT_WINDOW_DAYS },
        ipAddress: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      },
    });

    return new NextResponse(buildIncidentCsv(rows), {
      headers: {
        "Content-Type": CSV_CONTENT_TYPE,
        "Content-Disposition": `attachment; filename="${csvFilename(new Date())}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    // Logged with the village on it, because the two ways this realistically
    // fails — the database being unreachable and a migration not having been
    // applied — both need the server log to tell them apart, and neither should
    // reach a coordinator as a downloaded stack trace.
    console.error("CSV export failed for village %s", villageId, cause);

    return NextResponse.json(
      { error: "The export could not be built. Try again in a moment." },
      { status: 500 },
    );
  }
}
