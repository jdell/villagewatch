import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submitCoordinatorRequest } from "@/lib/coordinator-requests";
import { COORDINATOR_REQUEST_PAGE_SIZE } from "@/lib/constants";
import { coordinatorRequestSchema, fieldErrors } from "@/lib/validations";

/**
 * Coordinator access requests.
 *
 *   POST — a resident applies to coordinate their own village.
 *   GET  — a platform administrator lists applications, pending by default.
 *
 * Both surfaces exist alongside the pages that use them (`/coordinator-apply`
 * submits through a server action, `/admin/coordinators` renders server-side)
 * because the decision they carry is one an integration will want: a council
 * running several parishes wants to see the queue without opening a browser.
 * The rules are in `src/lib/coordinator-requests.ts` and both paths call it, so
 * neither can drift from the other.
 *
 * Note what the POST body does **not** contain: no village id, no user id and
 * no role. The applicant is the session, the village is their profile's, and
 * the `role` field is the standing they claim rather than a `UserRole` — the
 * promotion is written by server code on approval and never from a payload
 * (domain rule 5).
 */

/**
 * Which applications to list. Pending is the default because that is the queue;
 * the other two are the history tab.
 */
const listQuerySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING"),
});

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
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

  const parsed = coordinatorRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the application", fieldErrors: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }

  const result = await submitCoordinatorRequest({
    session,
    values: parsed.data,
  });

  if (!result.ok) {
    // Everything this can refuse — no village, already a coordinator, an
    // application already waiting — is a state the caller is in rather than a
    // malformed request, so it is a 409 and not a 422.
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json(
    { id: result.requestId, status: "PENDING" },
    { status: 201 },
  );
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  // Administrators only. A coordinator cannot read this: an application holds
  // one named resident's answer to "why do you want to read your neighbours'
  // reports", and the audience for that is the person deciding it.
  if (session.profile?.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only a platform administrator can review applications" },
      { status: 403 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "The database is not configured on this deployment." },
      { status: 503 },
    );
  }

  const parsed = listQuerySchema.safeParse({
    status: request.nextUrl.searchParams.get("status") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the query", fieldErrors: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }

  const requests = await prisma.coordinatorRequest.findMany({
    where: { status: parsed.data.status },
    orderBy: { createdAt: "desc" },
    take: COORDINATOR_REQUEST_PAGE_SIZE,
    select: {
      id: true,
      role: true,
      roleDetail: true,
      reason: true,
      status: true,
      reviewNote: true,
      reviewedAt: true,
      createdAt: true,
      user: { select: { id: true, fullName: true, email: true, role: true } },
      village: { select: { id: true, name: true, slug: true } },
      reviewedBy: { select: { id: true, fullName: true } },
    },
  });

  return NextResponse.json({ status: parsed.data.status, requests });
}
