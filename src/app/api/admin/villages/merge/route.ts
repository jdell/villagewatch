import { NextResponse, type NextRequest } from "next/server";
import { getSession, isPlatformAdmin, isSuperAdmin } from "@/lib/auth";
import { mergeVillages, previewVillageMerge } from "@/lib/village-merge";
import { villageMergeSchema } from "@/lib/validations";

/**
 * The village merge, behind the narrowest gate in the application.
 *
 * `GET` previews — what would move, and whether it may run at all. `POST`
 * performs it. Both are super-administrator only; see `src/lib/admin.ts` for
 * why that is a second list rather than `ADMIN_EMAILS`.
 *
 * ## Why a route handler rather than a server action
 *
 * The preview has to re-run whenever either selector changes, which is a client
 * event, and the merge itself wants a response the browser can read rather than
 * a redirect — a summary of what moved, including the reference mapping, which
 * is the one artefact a reversal depends on. The dashboard's CSV export takes
 * the same shape and for the same reason: every exit is JSON, so a failure
 * arrives as a sentence the form can render rather than Next's HTML error page.
 *
 * ## The gate is here as well as in the module
 *
 * `src/proxy.ts` passes `/api/` straight through without an auth check — it is
 * an optimistic redirect layer for navigations, not the authorisation boundary
 * — so a route handler that did not check its own session would be open to
 * anybody who could guess the path. `mergeVillages` re-checks a third time at
 * the module boundary, which is `villages.ts`'s convention: the privilege is
 * asserted next to the write, not only in front of it.
 *
 * `getSession()` rather than `requireSuperAdmin()`, because that one redirects
 * and a redirect reaching `fetch()` is a 200 full of HTML. Here a refusal is a
 * status code.
 */

/** One refusal for both "not signed in" and "not allowed", deliberately. */
function refuse(session: Awaited<ReturnType<typeof getSession>>) {
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  if (!isPlatformAdmin(session) || !isSuperAdmin(session)) {
    /**
     * Worded to say what is missing without saying who has it. An
     * administrator who lands here is entitled to know the screen exists and
     * needs a second grant; nobody is entitled to a list of who holds it.
     */
    return NextResponse.json(
      {
        error:
          "Merging villages needs super-administrator access, which is granted by SUPER_ADMIN_EMAILS.",
      },
      { status: 403 },
    );
  }

  return null;
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  const refused = refuse(session);
  if (refused) return refused;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "The database is not configured on this deployment." },
      { status: 503 },
    );
  }

  const origin = request.nextUrl.searchParams.get("origin");
  const target = request.nextUrl.searchParams.get("target");

  if (!origin || !target) {
    return NextResponse.json(
      { error: "Choose both villages." },
      { status: 400 },
    );
  }

  try {
    const preview = await previewVillageMerge(origin, target);

    if (!preview) {
      return NextResponse.json(
        { error: "One of those villages no longer exists." },
        { status: 404 },
      );
    }

    return NextResponse.json(preview);
  } catch (error) {
    console.error("[village-merge] preview failed", error);
    return NextResponse.json(
      { error: "Could not read those villages." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  const refused = refuse(session);
  if (refused) return refused;
  // `refuse` returns null only when the session is present and allowed, but
  // TypeScript cannot see that through the helper.
  if (!session) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

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
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const parsed = villageMergeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Check the form." },
      { status: 422 },
    );
  }

  const result = await mergeVillages({
    session,
    originId: parsed.data.originId,
    targetId: parsed.data.targetId,
    renameTo: parsed.data.renameTo ?? null,
  });

  if (!result.ok) {
    // 409 rather than 500: every refusal from that module is a statement about
    // the state of the two villages — not active, not compliant, too large —
    // and the fix is a decision rather than a retry.
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json(result.summary);
}
