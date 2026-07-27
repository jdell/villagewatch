import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { decideCoordinatorRequest } from "@/lib/coordinator-requests";
import {
  coordinatorRequestDecisionSchema,
  fieldErrors,
} from "@/lib/validations";

/**
 * PATCH /api/coordinator-requests/[id] — approve or reject one application.
 *
 * Approving is the single action in VillageWatch that raises somebody's role,
 * so the whole of it lives in `decideCoordinatorRequest()`: the status
 * transition, the promotion, the audit row and the applicant's notification
 * happen together or not at all. This handler validates and hands over.
 *
 * Next 16: a dynamic segment's `params` is a Promise and has to be awaited.
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  // Checked here and again inside `decideCoordinatorRequest`. This one gives
  // the caller a 403 instead of a 409; that one is the check that actually
  // guards the write.
  if (session.profile?.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only a platform administrator can decide an application" },
      { status: 403 },
    );
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "The database is not configured on this deployment." },
      { status: 503 },
    );
  }

  const { id } = await params;

  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not a valid id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = coordinatorRequestDecisionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Check the decision", fieldErrors: fieldErrors(parsed.error) },
      { status: 422 },
    );
  }

  const result = await decideCoordinatorRequest({
    session,
    requestId: id,
    decision: parsed.data.decision,
    note: parsed.data.note,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json({
    id: result.requestId,
    status: result.status,
    applicant: result.applicantName,
    village: result.villageName,
  });
}
