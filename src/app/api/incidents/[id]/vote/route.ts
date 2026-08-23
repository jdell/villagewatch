import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { PUBLIC_INCIDENT_STATUSES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import {
  incidentVoteRule,
  rateLimit,
  rateLimitHeaders,
  tooManyRequests,
} from "@/lib/rate-limit";
import {
  nextVote,
  summariseVotes,
  tallyFor,
  toVoteDirection,
  toVoteInput,
  type VoteState,
} from "@/lib/votes";

/**
 * POST /api/incidents/[id]/vote — a resident's view of how serious a report is.
 *
 * Body: `{ "vote": "up" | "down" }`. The response is the whole state of the
 * control afterwards — `{ up, down, score, myVote }` — rather than an
 * acknowledgement, because the button is optimistic and this is what it
 * reconciles against.
 *
 * ## It is a toggle, and the toggle rule lives in `src/lib/votes.ts`
 *
 * Pressing the button you already pressed removes your vote; pressing the other
 * one moves it. "No opinion" is the absence of a row, which is why there is no
 * DELETE verb here and no `NEUTRAL` in the enum. `nextVote` is the rule, and
 * `VoteButtons` calls the same function in the browser to draw the count before
 * this request lands — two copies of it would disagree the first time somebody
 * fixed one, and the symptom would be a number that flicks and then corrects
 * itself.
 *
 * ## What can be voted on
 *
 * Published and resolved reports in the caller's own village, and nothing else.
 * Three separate rules, in the order they are checked:
 *
 * - **The village is the tenant boundary** (domain rule 4). It comes off the
 *   session profile and never off the request; a report in another village is a
 *   404, not a 403, because a 403 would confirm that a report with that id
 *   exists somewhere.
 * - **Only what residents can already see** (domain rule 6). A report in the
 *   moderation queue is not public, and a vote on one would be a resident
 *   pushing something up an ordering before a coordinator has decided whether
 *   it should exist at all.
 * - **An erased report is gone for everybody**, and falls out of the same
 *   status filter.
 *
 * ## What a vote does not do
 *
 * It writes no status, moves no severity, publishes nothing and sends nothing.
 * See the header of `src/lib/votes.ts` for why that restraint is the design
 * rather than an unfinished half: severity drives the push audience and the
 * WhatsApp Channel's floor, so a control that moved it would let a handful of
 * taps decide who gets woken up.
 *
 * There is deliberately **no `AuditLog` row**. The trail records decisions
 * somebody is accountable for — publishing, rejecting, reading a reporter's
 * verbatim words — and a row per tap would bury every one of those in a village
 * where the buttons are used. It would also be a trail naming who voted which
 * way on their neighbour's report, readable by every coordinator in the
 * village, which is the one thing this feature promises not to expose.
 *
 * `params` is a Promise in Next.js 16 — awaited, never destructured in the
 * signature.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "The database is not configured on this deployment." },
      { status: 503 },
    );
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to vote" }, { status: 401 });
  }

  const villageId = session.profile?.villageId;
  if (!villageId) {
    // No village means no report is visible to this account at all, and the
    // answer is the same one a report in somebody else's village gets.
    return NextResponse.json(
      { error: "That report could not be found" },
      { status: 404 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const direction = toVoteDirection(
    (body as { vote?: unknown } | null)?.vote ?? null,
  );

  if (!direction) {
    return NextResponse.json(
      { error: "Send a vote of “up” or “down”." },
      { status: 422 },
    );
  }

  /*
    The report, before the quota.

    Rate limiting comes after the body validates everywhere in this codebase,
    and here it comes after the lookup as well. One cheap indexed read decides
    whether the caller can see the report at all, and spending a resident's
    ten-second window on a report that is in another village — or still in the
    queue — would let a stale page take the buttons away from them on the
    reports they *can* vote on.
  */
  const incident = await prisma.incident.findFirst({
    where: {
      id,
      villageId,
      status: { in: [...PUBLIC_INCIDENT_STATUSES] },
    },
    select: { id: true },
  });

  if (!incident) {
    return NextResponse.json(
      { error: "That report could not be found" },
      { status: 404 },
    );
  }

  // Scoped to this report — see `incidentVoteRule`. A per-resident limit would
  // refuse a vote on the second report in a list because you had just voted on
  // the first, which is how somebody reads a page of them.
  const quota = await rateLimit(incidentVoteRule(incident.id), session.user.id);

  if (!quota.ok) {
    return tooManyRequests(
      quota,
      "You have just changed your vote on this report.",
    );
  }

  const userId = session.user.id;

  const existing = await prisma.incidentVote.findUnique({
    where: { incidentId_userId: { incidentId: incident.id, userId } },
    select: { vote: true },
  });

  const next = nextVote(existing?.vote ?? null, direction);

  try {
    if (next.action === "delete") {
      // `deleteMany` rather than `delete`: a row that has gone between the read
      // above and this write is the outcome asked for, not a P2025.
      await prisma.incidentVote.deleteMany({
        where: { incidentId: incident.id, userId },
      });
    } else {
      // One statement for both create and update. The unique key on
      // `(incident_id, user_id)` is what makes it atomic — a read-then-write
      // pair could leave a resident holding two opinions, which is the one
      // state the tallies below cannot represent.
      await prisma.incidentVote.upsert({
        where: { incidentId_userId: { incidentId: incident.id, userId } },
        create: { incidentId: incident.id, userId, vote: direction },
        update: { vote: direction },
      });
    }
  } catch (cause) {
    console.error("Could not record a vote on %s", incident.id, cause);
    return NextResponse.json(
      { error: "Your vote could not be saved. Try again." },
      { status: 503 },
    );
  }

  /*
    Re-counted from the database rather than adjusted in memory.

    It is one indexed aggregate, and it is what makes the number on screen the
    village's rather than this browser's: several residents voting on the same
    report in the same minute each get the total as it actually stands, instead
    of their own optimistic guess confirmed back to them.
  */
  const rows = await prisma.incidentVote.groupBy({
    by: ["incidentId", "vote"],
    where: { incidentId: incident.id },
    _count: { _all: true },
  });

  const state: VoteState = {
    ...tallyFor(summariseVotes(rows), incident.id),
    myVote: toVoteInput(next.vote),
  };

  return NextResponse.json(
    { ok: true, ...state },
    { headers: rateLimitHeaders(quota) },
  );
}
