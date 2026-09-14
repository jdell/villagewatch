import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getSession, isPlatformAdmin } from "@/lib/auth";
import { archiveVillageInterestSchema, fieldErrors } from "@/lib/validations";
import {
  archiveVillageInterest,
  restoreVillageInterest,
} from "@/lib/village-interest";

/**
 * `PATCH /api/admin/village-interest/[id]/archive` — take one registration off
 * the working list, or put it back.
 *
 * **Platform administrators only, checked here.** `src/proxy.ts` passes `/api/`
 * straight through, so nothing above this handler has looked at who is calling
 * — which is what the merge route's header says in as many words and is why
 * that one checks three times. There is no village to scope by (domain rule 4
 * has nothing to bite on: an interest row is about a village that does not
 * exist), so `isPlatformAdmin` is the whole gate, and it is the same one
 * `/admin/villages` renders behind.
 *
 * ## `DELETE` is deliberately not implemented
 *
 * The obvious sibling of this route, and the one thing this feature must not
 * do from a button. An interest row is the only record that somebody asked for
 * a village, and the counts behind "eleven people are waiting" are what a
 * parish council gets quoted — see the migration's header. Erasure still
 * happens, by hand as the owner, when somebody writes to the address `/privacy`
 * §2 gives them; that is a person exercising Article 17 and not an
 * administrator tidying a list, and the difference is exactly why one is a
 * button and the other is not.
 *
 * ## Restore shares the route rather than getting its own
 *
 * `{ "restore": true }` is the whole of it. One row, one column, two
 * directions — `suspendVillage` and `reactivateVillage` are two functions
 * because each writes a different set of columns and refuses from a different
 * status, and these two do as well; what they share is the URL, because a
 * second path segment for the inverse of an action on the same row is a second
 * thing to keep the gate in step with.
 */

/** Prisma is a Node library. */
export const runtime = "nodejs";

/** Every call is a write. */
export const dynamic = "force-dynamic";

/**
 * The restore flag, read before the archive body is parsed.
 *
 * Separate from `archiveVillageInterestSchema` rather than a member of it: a
 * restore takes no reason, and folding the two into one schema would mean a
 * union whose one branch requires a field the other forbids — which is a shape
 * that reads as "reason optional" the first time somebody skims it.
 */
const restoreSchema = z.object({ restore: z.literal(true) });

export async function PATCH(
  request: NextRequest,
  // Next 16: a dynamic segment's `params` is a Promise and has to be awaited.
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  if (!isPlatformAdmin(session)) {
    return NextResponse.json(
      { error: "Only a platform administrator can archive a registration" },
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

  /*
    Narrowed before it reaches a query. Prisma would reject a malformed uuid
    with a `P2023` that reaches the caller as a 500 — a validation failure
    wearing a server error, on a path where the id came out of the page's own
    markup and being wrong means something else is.
  */
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Not a valid id" }, { status: 400 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (restoreSchema.safeParse(body).success) {
    const restored = await restoreVillageInterest(id);

    if (!restored.ok) {
      return NextResponse.json({ error: restored.error }, { status: 409 });
    }

    return NextResponse.json({ ok: true, status: "PENDING" });
  }

  const parsed = archiveVillageInterestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Choose why you are archiving this",
        fieldErrors: fieldErrors(parsed.error),
      },
      { status: 422 },
    );
  }

  const archived = await archiveVillageInterest({
    id,
    reason: parsed.data.reason,
  });

  if (!archived.ok) {
    /*
      409 rather than 404 for both refusals this can give. One of them — "it is
      already archived" — is not an error at all but a stale tab, and the
      sentence the module returns says so; a 404 would send somebody looking for
      a row that is sitting in front of them.
    */
    return NextResponse.json({ error: archived.error }, { status: 409 });
  }

  return NextResponse.json({ ok: true, status: "ARCHIVED" });
}
