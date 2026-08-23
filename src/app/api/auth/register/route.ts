import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fieldErrors, registerSchema } from "@/lib/validations";
import { fuzzCoordinates } from "@/lib/geo";
import { HOME_LOCATION_FUZZ_METERS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import { checkVillageJoin } from "@/lib/villages";
import { describeAuthError } from "@/lib/auth-errors";

/**
 * POST /api/auth/register
 *
 * Creates the Supabase auth user, then the matching profile row. `User.id`
 * mirrors `auth.users.id` — the two must never drift.
 *
 * The village and role come from the server, never from the client payload
 * beyond the chosen village id: a resident cannot register themselves as a
 * coordinator by posting `role: "ADMIN"`.
 *
 * **Whether this village will have them is `checkVillageJoin`'s answer, not
 * this route's.** It used to be decided here, in a hand-rolled comparison that
 * `/api/auth/complete-profile` had its own copy of — and both copies asked
 * `if (joinCode && !codeMatches)`, so a wrong code was refused and a blank one
 * was waved through into the village as a plain `RESIDENT`. One function, both
 * paths, and the code is required whenever the village has one.
 *
 * The home location arrives as the exact point the resident tapped and is
 * jittered here, on the server, before it is written — same reasoning as
 * domain rule 2 and the same function. Doing it in the browser would show them
 * a pin that jumps away from where they put it, and a modified client could
 * skip it.
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { error: "Authentication is not configured on this deployment." },
      { status: 503 },
    );
  }

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
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the highlighted fields",
        fieldErrors: fieldErrors(parsed.error),
      },
      { status: 422 },
    );
  }

  const {
    fullName,
    email,
    password,
    villageId,
    joinCode,
    addressLine,
    phone,
    homeLat,
    homeLng,
  } = parsed.data;

  // Both or neither — the schema already refuses one without the other.
  const home =
    homeLat !== undefined && homeLng !== undefined
      ? fuzzCoordinates(homeLat, homeLng, HOME_LOCATION_FUZZ_METERS)
      : null;

  // The status check, the code check and the standing it earns, in one place.
  // Refused before the auth user is created, so a rejected registration leaves
  // nothing behind in Supabase Auth to collide with a later attempt.
  const join = await checkVillageJoin({ villageId, joinCode });

  if (!join.ok) {
    return NextResponse.json(
      {
        error: join.error,
        fieldErrors: { [join.field]: join.error },
      },
      { status: 422 },
    );
  }

  const { village, verified } = join;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });

  if (error || !data.user) {
    const alreadyRegistered = error?.message
      ?.toLowerCase()
      .includes("already registered");

    if (alreadyRegistered) {
      return NextResponse.json(
        {
          error: "An account with that email already exists",
          fieldErrors: { email: "Try signing in instead" },
        },
        { status: 400 },
      );
    }

    /*
      Everything else is described by `describeAuthError`, and the provider's
      own wording never leaves this function.

      This branch used to be `error?.message ?? "Could not create your
      account"`, which is how "email rate limit exceeded" — Supabase's phrase
      for an exhausted hourly mail quota — reached residents as a red popup
      while they were trying to join their village. It names a quota they have
      no part in, at a moment when it reads as a fault in their details, and it
      does not suggest the one thing that works: waiting.

      The rate limit is a 429 rather than a 400, so the browser can tell it
      apart without reading the sentence, and `Retry-After` carries the wait in
      the header a rate limit is supposed to use. Nothing was created here — the
      auth user is what `signUp` failed to make — so there is nothing to undo.
    */
    const described = describeAuthError(error, "signup");

    // Logged rather than returned. An operator needs the provider's exact
    // wording to tell an exhausted quota from a misconfigured SMTP sender;
    // a resident needs neither.
    console.error("Sign-up failed: %s", error?.message ?? "no user returned");

    return NextResponse.json(
      {
        error: described.message,
        ...(described.retryAfter ? { retryAfter: described.retryAfter } : {}),
      },
      {
        status: described.rateLimited ? 429 : 400,
        headers: described.retryAfter
          ? { "Retry-After": String(described.retryAfter) }
          : undefined,
      },
    );
  }

  try {
    await prisma.user.create({
      data: {
        id: data.user.id,
        email,
        fullName,
        phone,
        addressLine,
        homeLat: home?.lat,
        homeLng: home?.lng,
        villageId: village.id,
        role: verified ? "VERIFIED_RESIDENT" : "RESIDENT",
        verifiedAt: verified ? new Date() : null,
      },
    });
  } catch (cause) {
    // The auth user now exists without a profile. Surface it loudly rather
    // than letting the user land in a half-registered state silently.
    console.error("Failed to create profile for %s", data.user.id, cause);
    return NextResponse.json(
      {
        error:
          "Your login was created but your profile was not. Contact your coordinator.",
      },
      { status: 500 },
    );
  }

  // Staff channel, after the profile row is safely written — an alert about a
  // registration that then failed would be worse than none. Cannot throw.
  await notifySlack(
    `🆕 New user: ${fullName} (${email}) joined ${village.name}`,
  );

  // With email confirmation enabled, signUp returns a user but no session.
  const needsEmailConfirmation = data.session === null;

  return NextResponse.json(
    { ok: true, needsEmailConfirmation, redirectTo: "/map" },
    { status: 201 },
  );
}
