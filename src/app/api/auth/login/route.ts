import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fieldErrors, loginSchema } from "@/lib/validations";
import { prisma } from "@/lib/prisma";
import { firstForwardedAddress } from "@/lib/audit-context";
import {
  RATE_LIMITS,
  authSubject,
  rateLimit,
  tooManyRequests,
} from "@/lib/rate-limit";
import {
  EMAIL_NOT_CONFIRMED_MESSAGE,
  describeAuthError,
  isEmailNotConfirmedError,
} from "@/lib/auth-errors";

/**
 * POST /api/auth/login
 *
 * Signs the user in and writes the Supabase session cookies. Route Handlers
 * have a writable cookie store, so `createClient()`'s `setAll` lands here.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { error: "Authentication is not configured on this deployment." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the highlighted fields",
        fieldErrors: fieldErrors(parsed.error),
      },
      { status: 422 },
    );
  }

  const { email, password, next } = parsed.data;

  /*
    Counted after the body validates and before the credentials are checked,
    which is this table's rule: a malformed request costs a Zod parse, and
    burning a slot on one would let a client-side bug spend somebody's window
    without a single attempt reaching Supabase.

    Keyed by address because nobody is signed in yet — `authSubject` carries the
    argument, including why an unknown address is not limited rather than being
    bucketed with every other unknown one.

    Supabase limits this endpoint too. That is the deployment's ceiling rather
    than this route's, it is shared with every other auth flow, and being
    refused by it arrives as wording about email quotas — so it is a backstop
    for this rather than a replacement.
  */
  const subject = authSubject(firstForwardedAddress(request.headers.get("x-forwarded-for")));

  if (subject) {
    const quota = await rateLimit(RATE_LIMITS.authLogin, subject);

    if (!quota.ok) {
      return tooManyRequests(
        quota,
        "Too many sign-in attempts from this connection. Please wait a moment and try again.",
      );
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    /*
      A rate limit is not a wrong password, and saying it is sends somebody off
      to reset a password that was correct — which spends an email out of the
      same exhausted quota that caused this. It is also not an enumeration
      oracle: the limit is counted per client rather than per account, so the
      answer is the same for an address with no account behind it.

      Everything else keeps the deliberate vagueness. Whether the email exists
      is exactly what this response must not say.
    */
    const described = describeAuthError(error, "signin");

    if (described.rateLimited) {
      return NextResponse.json(
        { error: described.message, retryAfter: described.retryAfter },
        {
          status: 429,
          headers: { "Retry-After": String(described.retryAfter) },
        },
      );
    }

    /*
      The one case that is not vague, and the paragraph above is the reason it
      needs justifying rather than just adding.

      Somebody who registered and never clicked the link used to be told their
      password was wrong. It is not wrong — it is right, which is the only
      reason GoTrue got as far as looking at the confirmation state — so the
      advice was false and the action it suggested (reset the password) spends
      an email to arrive at the same dead end. They then have two unread
      messages in the same inbox and no idea that the first one is the one that
      matters.

      It is not an enumeration oracle, and `isEmailNotConfirmedError` carries
      the whole argument for why: the password is authenticated *before* the
      confirmation state is consulted, so this sentence is only ever shown to
      somebody who already had the credentials. A caller guessing at addresses
      still gets the sentence below and learns nothing.

      403 rather than 401 because the credentials were accepted; what is missing
      is a step, not a password. The form reads `code` rather than matching on
      the sentence — see `LoginForm`.
    */
    if (isEmailNotConfirmedError(error)) {
      return NextResponse.json(
        { error: EMAIL_NOT_CONFIRMED_MESSAGE, code: "email_not_confirmed" },
        { status: 403 },
      );
    }

    return NextResponse.json(
      { error: "Email or password is incorrect" },
      { status: 401 },
    );
  }

  if (process.env.DATABASE_URL) {
    // A closed account still has an `auth.users` row, so the password above is
    // still correct and Supabase is right to have accepted it. What decides
    // whether it opens anything is `deletedAt` — see `eraseAccount()`. The
    // session is torn down again before returning, or the browser would hold
    // cookies for an account that cannot go anywhere.
    const profile = await prisma.user.findUnique({
      where: { id: data.user.id },
      select: { deletedAt: true },
    });

    if (profile?.deletedAt) {
      await supabase.auth.signOut();

      return NextResponse.json(
        {
          error:
            "This account has been closed. Contact your village coordinator if you need it back.",
        },
        { status: 403 },
      );
    }

    await prisma.user.updateMany({
      where: { id: data.user.id },
      data: { lastActiveAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true, redirectTo: next ?? "/map" });
}
