import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { removeIncident } from "@/lib/erasure";

/**
 * DELETE /api/incidents/[id] — the reporter erasing their own report.
 *
 * UK GDPR Article 17. A resident who filed something has to be able to take it
 * back, and until now the only way was the "Withdraw" button, which covered the
 * queue statuses only and hard-deleted the row underneath the audit trail.
 *
 * Everything this actually does is in `src/lib/erasure.ts` — the storage
 * deletion, the tag deletion, the audit row and the status change, in that
 * order and for the reasons documented there. This handler is the HTTP shape
 * around it:
 *
 * - **204** and no body. There is nothing left to describe.
 * - **403** when the caller is signed in and is not the reporter.
 * - **404** when the report is not in their village, does not exist, or has
 *   already been erased. A 403 in those cases would confirm that a report with
 *   that id exists somewhere, which is a cross-village read of one bit (domain
 *   rule 4).
 *
 * Note the split: *not yours* is a 403, *not visible to you* is a 404, and the
 * library decides which by checking the village before the reporter.
 *
 * `params` is a Promise in Next.js 16 — awaited, never destructured in the
 * signature.
 */

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to delete a report" },
      { status: 401 },
    );
  }

  // The tenant boundary, off the session and never off the request.
  const villageId = session.profile?.villageId;
  if (!villageId) {
    return NextResponse.json(
      { error: "That report could not be found" },
      { status: 404 },
    );
  }

  const result = await removeIncident({
    session,
    villageId,
    incidentId: id,
  });

  if (!result.ok) {
    const status =
      result.reason === "forbidden"
        ? 403
        : result.reason === "not_found"
          ? 404
          : 503;

    return NextResponse.json({ error: result.error }, { status });
  }

  if (result.mediaSkipped) {
    // Not a failure the caller can act on — the report is off every screen
    // either way — but the files are still in the bucket and somebody should
    // know. The nightly retention sweep will find them again.
    console.warn(
      "Erasure of %s left its media in place: %s",
      result.reference,
      result.mediaSkipped,
    );
  }

  return new NextResponse(null, { status: 204 });
}
