import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notifyIncidentPublished } from "@/lib/notifications";
import { PUBLIC_INCIDENT_STATUSES, isCoordinatorRole } from "@/lib/constants";
import { fieldErrors } from "@/lib/validations";

/**
 * POST /api/notifications — re-send the village alert for a published incident.
 *
 * Approving a report already fires its alert inline (`applyModeration` in
 * `src/lib/moderation.ts`), so this route is not on the publish path. It exists
 * for the case that path cannot cover: OneSignal was down, or the deployment
 * had no credentials when the report was approved, and a coordinator needs to
 * push it out now.
 *
 * Three guards, and none of them are optional:
 *
 * - **Coordinators only.** A resident who could call this could push a
 *   notification to every phone in the village.
 * - **Village-scoped.** The incident is looked up under the caller's own
 *   village (domain rule 4), so an id from elsewhere is a 404.
 * - **Published only.** A report still in the queue has not cleared moderation
 *   and must not reach residents (domain rule 6). This is the check that stops
 *   the route becoming a way around the queue.
 */

const notifyRequestSchema = z.object({ incidentId: z.uuid() });

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const villageId = session.profile?.villageId;
  const role = session.profile?.role;

  if (!villageId || !role || !isCoordinatorRole(role)) {
    return NextResponse.json(
      { error: "Only village coordinators can send alerts" },
      { status: 403 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "The database is not configured on this deployment." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = notifyRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the request", fieldErrors: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }

  const incident = await prisma.incident.findFirst({
    where: {
      id: parsed.data.incidentId,
      villageId,
      status: { in: [...PUBLIC_INCIDENT_STATUSES] },
    },
    select: {
      id: true,
      reference: true,
      title: true,
      severity: true,
      locationText: true,
      lat: true,
      lng: true,
      occurredAt: true,
    },
  });

  if (!incident) {
    return NextResponse.json(
      { error: "No published report with that id in your village" },
      { status: 404 },
    );
  }

  const result = await notifyIncidentPublished({
    id: incident.id,
    villageId,
    title: incident.title,
    severity: incident.severity,
    locationText: incident.locationText,
    lat: incident.lat,
    lng: incident.lng,
    occurredAt: incident.occurredAt,
  });

  // A re-send is a privileged action that reaches every phone in the village.
  // It gets the same trail as publishing did (domain rule 7).
  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorEmail: session.user.email,
      actorRole: role,
      villageId,
      action: "incident.notify",
      entityType: "Incident",
      entityId: incident.id,
      after: {
        reference: incident.reference,
        matched: result.matched,
        sent: result.sent,
        skipped: result.skipped ?? null,
      },
      ipAddress: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    },
  });

  return NextResponse.json({
    reference: incident.reference,
    matched: result.matched,
    sent: result.sent,
    skipped: result.skipped,
  });
}
