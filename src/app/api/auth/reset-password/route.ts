import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fieldErrors, resetPasswordSchema } from "@/lib/validations";
import { describeAuthError } from "@/lib/auth-errors";

/**
 * POST /api/auth/reset-password — set a new password for the current session.
 *
 * The recovery link has already been through `/api/auth/callback` by the time
 * anything reaches here, so the caller holds a real session and Supabase knows
 * whose password to change. Nothing in the body identifies a user, and that is
 * the point: an email or a user id here would be a way to set somebody else's
 * password with a link addressed to you.
 *
 * A Route Handler rather than `updateUser` straight from the browser, for the
 * same reasons as its neighbours — the password is validated server-side by the
 * same schema registration uses, and rotating the password rotates the session
 * cookies, which only a handler can write.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { error: "Authentication is not configured on this deployment." },
      { status: 503 },
    );
  }

  // `getSession` calls `supabase.auth.getUser()`, which revalidates the JWT
  // against Supabase rather than trusting the cookie — the distinction the auth
  // model in CLAUDE.md insists on, and it matters more here than anywhere else.
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      {
        error:
          "That reset link has expired. Ask for a new one and try again.",
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the highlighted fields",
        fieldErrors: fieldErrors(parsed.error),
      },
      { status: 422 },
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });

  if (error) {
    /*
      The common case is Supabase's own "New password should be different from
      the old password", which is a fact about the password rather than about
      the account, so it is safe to say in our own words. Anything else goes
      through `describeAuthError`, which tells a rate limit apart from a real
      failure and never passes the provider's wording on. Both are logged.
    */
    console.error("Password update failed for %s", session.user.id, error);

    const samePassword = error.message
      .toLowerCase()
      .includes("should be different");

    if (samePassword) {
      return NextResponse.json(
        {
          error: "That is already your password. Choose a different one.",
          fieldErrors: { password: "Choose a password you have not used" },
        },
        { status: 422 },
      );
    }

    // A rate limit here is worse than it looks: the advice in the generic
    // message is "ask for a new link", which spends an email out of whichever
    // quota is already exhausted. `describeAuthError` says wait instead, and
    // the session that got them here is still good in the meantime.
    const described = describeAuthError(error, "reset-update");

    return NextResponse.json(
      {
        error: described.message,
        ...(described.retryAfter ? { retryAfter: described.retryAfter } : {}),
      },
      {
        status: described.rateLimited ? 429 : 500,
        headers: described.retryAfter
          ? { "Retry-After": String(described.retryAfter) }
          : undefined,
      },
    );
  }

  // Straight into the app: the recovery link signed them in, and asking someone
  // to type the password they just chose serves no purpose. `/map` matches where
  // `POST /api/auth/login` lands, and the layout redirects to `/welcome` by
  // itself if this account has no profile row yet.
  return NextResponse.json({ ok: true, redirectTo: "/map" }, { status: 200 });
}
