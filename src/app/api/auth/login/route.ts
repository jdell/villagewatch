import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fieldErrors, loginSchema } from "@/lib/validations";
import { prisma } from "@/lib/prisma";
import { describeAuthError } from "@/lib/auth-errors";

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
