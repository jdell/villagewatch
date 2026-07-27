import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
  isCoordinatorRole,
} from "@/lib/constants";

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
 */

/** A year of reports is more than any meeting needs and keeps the file small. */
const EXPORT_WINDOW_DAYS = 365;

const COLUMNS = [
  "date",
  "time",
  "reference",
  "type",
  "severity",
  "status",
  "location",
  "description",
  "people_count",
  "tags",
] as const;

const DATE = new Intl.DateTimeFormat("en-GB", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Europe/London",
});

const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Europe/London",
});

/**
 * Escapes one CSV field.
 *
 * The leading apostrophe on `=`, `+`, `-` and `@` is not decoration: Excel and
 * Sheets evaluate a cell starting with any of them as a formula, so a report
 * whose description begins "=" would execute on the councillor's laptop rather
 * than being read. Quoting alone does not prevent it — the prefix does.
 */
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  const text = String(value);
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  return `"${guarded.replace(/"/g, '""')}"`;
}

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

  const rows = await prisma.incident.findMany({
    // `REMOVED` is excluded, and this is the one query where saying so matters.
    // Every other read is already narrowed to a status list; this one is
    // deliberately wide, because a coordinator exporting their village's reports
    // wants the rejected and archived ones too. An erased report is the
    // exception: a spreadsheet gets emailed and forwarded, so a report a
    // resident asked to have deleted must not leave in one the day after they
    // asked (UK GDPR Article 17).
    where: { villageId, status: { not: "REMOVED" }, occurredAt: { gte: since } },
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

  const lines = [COLUMNS.join(",")];

  for (const row of rows) {
    lines.push(
      [
        csvField(DATE.format(row.occurredAt)),
        csvField(TIME.format(row.occurredAt)),
        csvField(row.reference),
        csvField(INCIDENT_TYPE_LABELS[row.type]),
        csvField(SEVERITY_LABELS[row.severity]),
        csvField(INCIDENT_STATUS_LABELS[row.status]),
        csvField(row.locationText),
        csvField(row.description),
        csvField(row.peopleCount),
        csvField(row.tags.map((tag) => tag.label).join("; ")),
      ].join(","),
    );
  }

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

  const stamp = new Date().toISOString().slice(0, 10);

  // The leading BOM is what makes Excel open a UTF-8 CSV as UTF-8. Without it,
  // every pound sign and curly apostrophe in a description arrives mojibaked —
  // and the whole point of this file is that someone reads it in Excel.
  const body = `﻿${lines.join("\r\n")}\r\n`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="villagewatch-incidents-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
