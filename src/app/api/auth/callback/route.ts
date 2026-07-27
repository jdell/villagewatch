import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/auth/callback — where an identity provider drops the resident back.
 *
 * Supabase's browser client starts the PKCE flow and Google returns here with a
 * `code`. Exchanging it for a session has to happen server-side, in a Route
 * Handler, because that is the only place with a writable cookie store — the
 * same reason `POST /api/auth/login` lives next door.
 *
 * A Google account arrives with an identity and nothing else: no village, no
 * join code, no acceptance of the terms. That is the whole difference from the
 * password flow, where `POST /api/auth/register` writes the profile row before
 * it ever returns. So this route decides between two destinations — the app for
 * somebody who already has a profile, and `/welcome` for somebody who does not.
 * It never creates the profile itself: `role`, `villageId` and `verifiedAt` are
 * set by server code from a verified join code (domain rule 5), and none of
 * those facts exist yet at this point in the flow.
 */

/** Everything here reads cookies and the database; never prerender it. */
export const dynamic = "force-dynamic";

/**
 * `next` arrives in a query string that a stranger can write, so it is treated
 * as hostile: relative paths only, and never protocol-relative. `//evil.test`
 * is a valid URL that browsers send off-origin, and it starts with the "/" a
 * naive check accepts.
 */
function safeNext(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  return value;
}

/** Bounce back to /login with something a human can act on. */
function toLogin(request: NextRequest, message: string) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return toLogin(request, "Authentication is not configured on this deployment.");
  }

  const params = request.nextUrl.searchParams;

  // The provider reports refusals here too — a denied consent screen, or a
  // provider that is not switched on in the Supabase dashboard. Neither is an
  // error worth a stack trace; both mean "back to the sign-in page".
  const providerError = params.get("error");
  if (providerError) {
    const description = params.get("error_description");
    console.warn("OAuth callback returned %s: %s", providerError, description);
    return toLogin(
      request,
      providerError === "access_denied"
        ? "Sign-in was cancelled."
        : "That sign-in did not complete. Try again, or use your email and password.",
    );
  }

  const code = params.get("code");
  if (!code) {
    return toLogin(request, "That sign-in link is incomplete. Try again.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    console.error("OAuth code exchange failed", error);
    return toLogin(request, "That sign-in could not be completed. Try again.");
  }

  const next = safeNext(params.get("next"));

  // No database configured is not a reason to strand somebody who has just
  // authenticated — send them on and let the app layout decide what it can show.
  if (!process.env.DATABASE_URL) {
    const url = request.nextUrl.clone();
    url.pathname = next ?? "/map";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const profile = await prisma.user.findUnique({
    where: { id: data.user.id },
    select: { id: true, deletedAt: true },
  });

  const url = request.nextUrl.clone();
  url.search = "";

  // The same gate `POST /api/auth/login` applies, for the same reason: Google
  // is happy to vouch for the identity, and `deletedAt` is what says the account
  // it belongs to is closed. Checked before the `!profile` branch below, or a
  // closed account would be sent to `/welcome` and could rejoin a village by
  // filling the form in again.
  if (profile?.deletedAt) {
    await supabase.auth.signOut();
    url.pathname = "/account-closed";
    return NextResponse.redirect(url);
  }

  if (!profile) {
    // First time through. `/welcome` collects the village, the join code and
    // the terms, then creates the row. `next` is carried across so a resident
    // who followed a link to an incident still lands on it afterwards.
    url.pathname = "/welcome";
    if (next) url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  // Parity with POST /api/auth/login, which does the same on every sign-in.
  await prisma.user.updateMany({
    where: { id: data.user.id },
    data: { lastActiveAt: new Date() },
  });

  url.pathname = next ?? "/map";
  return NextResponse.redirect(url);
}
