import { NextResponse, type NextRequest } from "next/server";

import { firstForwardedAddress } from "@/lib/audit-context";
import { DATA_CONTROLLER } from "@/lib/constants";
import { sendEmail } from "@/lib/email/send";
import { villageInterestEmail } from "@/lib/email/village-interest";
import {
  RATE_LIMITS,
  authSubject,
  rateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";
import { notifyCoordinatorCandidate } from "@/lib/slack";
import { fieldErrors, villageInterestSchema } from "@/lib/validations";
import { recordVillageInterest } from "@/lib/village-interest";

/**
 * `POST /api/village-interest` — somebody wants VillageWatch in a village that
 * is not in service.
 *
 * **It creates no account, and that is the whole of what makes it different
 * from `/api/auth/register` next door.** No Supabase auth user, no `User` row,
 * no session, no confirmation link, no join code and no terms acceptance. What
 * it writes is one row in `village_interest`, which nobody can sign in to see.
 *
 * ## It is deliberately not behind the same gates as registration
 *
 * There is no village to check (`checkVillageJoin` needs one), no compliance
 * gate to consult (that closes *reporting* in a village, and there is no
 * village), and no service state to read. Adding any of them would be checking
 * a condition about a place the caller has just told us does not exist here.
 *
 * ## What it does share
 *
 * The **rate limit**, keyed by address for the reason the two auth rules are:
 * nobody is signed in, and `x-forwarded-for` is the only thing on the request
 * that identifies a caller. `RATE_LIMITS.villageInterest` is its own rule
 * rather than a borrowed one — see the comment there for why it is five an hour
 * and not `authRegister`'s three.
 *
 * And the **order**: the body is validated before a slot is spent, so a
 * client-side bug cannot burn somebody's window without a single row being
 * written. That is this table's rule and `/api/incidents`'s.
 */

/** Prisma and Resend are Node libraries. */
export const runtime = "nodejs";

/** Nothing here is cacheable; every call is a write. */
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json(
      { error: "This deployment is not configured to take registrations yet." },
      { status: 503 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = villageInterestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the highlighted fields",
        fieldErrors: fieldErrors(parsed.error),
      },
      { status: 422 },
    );
  }

  const subject = authSubject(
    firstForwardedAddress(request.headers.get("x-forwarded-for")),
  );

  if (subject) {
    const quota = await rateLimit(RATE_LIMITS.villageInterest, subject);

    if (!quota.ok) {
      return tooManyRequests(
        quota,
        "That is a few registrations from this connection. Please wait a little and try again.",
      );
    }
  }

  const input = parsed.data;
  const isCoordinatorCandidate = input.role === "coordinator-candidate";

  /*
    The write is the act, so it is the one thing here allowed to fail the
    request. Everything after it is a courtesy: the row exists, the person has
    registered their interest, and telling them otherwise because a mail server
    was slow would be false — the same reasoning `POST /api/auth/register` uses
    for awaiting the welcome *after* the profile exists.
  */
  try {
    await recordVillageInterest(input);
  } catch (cause) {
    console.error(
      "Could not record interest in %s",
      input.villageName,
      cause,
    );

    return NextResponse.json(
      { error: "We could not save that just now. Please try again." },
      { status: 500 },
    );
  }

  /*
    Awaited rather than floated, which on Vercel is what fire-and-forget has to
    mean: the instance is frozen when the response returns, so a detached
    promise is not "sent later", it is "sometimes never sent at all".
    `sendEmail` never throws and `notifyCoordinatorCandidate` cannot either, so
    the cost is bounded and the failure mode is a log.
  */
  await sendEmail({
    to: input.email,
    /*
      The email tells this person they can "reply to this message" to be
      deleted, and that has to be true: the sending address is a no-reply by
      convention, so a reply to it goes nowhere. This is the only removal route
      somebody with no account has, so the header that makes it work is not
      optional decoration.
    */
    replyTo: DATA_CONTROLLER.email,
    message: villageInterestEmail({
      name: input.fullName,
      villageName: input.villageName,
      isCoordinatorCandidate,
    }),
  });

  /*
    Only for the coordinator path. A resident registering interest is a row on a
    dashboard; a candidate is the thing that unblocks a village, and it is worth
    interrupting somebody for. The message carries no motivation — see
    `notifyCoordinatorCandidate`.
  */
  if (isCoordinatorCandidate) {
    await notifyCoordinatorCandidate({
      name: input.fullName,
      email: input.email,
      villageName: input.villageName,
      county: input.county,
      hasMotivation: Boolean(input.motivation),
    });
  }

  /*
    The village name comes back so the confirmation screen can say it. It is
    echoed from the validated input rather than read back from the row: the
    screen is confirming what this person just typed, and a round trip to the
    database to re-read their own sentence buys nothing.
  */
  return NextResponse.json({
    ok: true,
    villageName: input.villageName,
    isCoordinatorCandidate,
  });
}
