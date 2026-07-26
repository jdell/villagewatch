import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { completeProfileSchema, fieldErrors } from "@/lib/validations";
import { fuzzCoordinates } from "@/lib/geo";
import { HOME_LOCATION_FUZZ_METERS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/auth/complete-profile
 *
 * The second half of `POST /api/auth/register`, for accounts that arrived
 * through an identity provider. Supabase already created the auth user and
 * verified the email; what is missing is everything the provider has no opinion
 * about — the village, the join code, the terms.
 *
 * The identity is taken from the session and never from the body. `id` mirrors
 * `auth.users.id` and `email` is the address Google verified; a client that
 * could supply either would be choosing whose account it was filling in.
 *
 * `role` and `verifiedAt` are derived here from a join code checked against the
 * database (domain rule 5), exactly as the register route derives them. There
 * is no path by which a payload can ask for a role.
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

  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in before joining a village" },
      { status: 401 },
    );
  }

  // Already finished. Not an error worth alarming anyone about — two tabs, or a
  // resubmitted form — but it must never become a way to rewrite a profile,
  // which is what an unguarded upsert here would be.
  if (session.profile) {
    return NextResponse.json({ ok: true, redirectTo: "/map" }, { status: 200 });
  }

  const email = session.user.email;
  if (!email) {
    return NextResponse.json(
      { error: "Your sign-in provider did not share an email address." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = completeProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Check the highlighted fields",
        fieldErrors: fieldErrors(parsed.error),
      },
      { status: 422 },
    );
  }

  const { fullName, villageId, joinCode, addressLine, phone, homeLat, homeLng } =
    parsed.data;

  const home =
    homeLat !== undefined && homeLng !== undefined
      ? fuzzCoordinates(homeLat, homeLng, HOME_LOCATION_FUZZ_METERS)
      : null;

  const village = await prisma.village.findFirst({
    where: { id: villageId, status: "ACTIVE" },
    select: { id: true, joinCode: true },
  });

  if (!village) {
    return NextResponse.json(
      {
        error: "That village is not accepting new residents",
        fieldErrors: { villageId: "Choose a different village" },
      },
      { status: 422 },
    );
  }

  const codeMatches = Boolean(
    joinCode &&
      village.joinCode &&
      joinCode.trim().toUpperCase() === village.joinCode.toUpperCase(),
  );

  if (joinCode && !codeMatches) {
    return NextResponse.json(
      {
        error: "That join code is not valid for this village",
        fieldErrors: { joinCode: "Check the code with your coordinator" },
      },
      { status: 422 },
    );
  }

  try {
    await prisma.user.create({
      data: {
        id: session.user.id,
        email,
        fullName,
        phone,
        addressLine,
        homeLat: home?.lat,
        homeLng: home?.lng,
        villageId: village.id,
        role: codeMatches ? "VERIFIED_RESIDENT" : "RESIDENT",
        verifiedAt: codeMatches ? new Date() : null,
      },
    });
  } catch (cause) {
    console.error("Failed to create profile for %s", session.user.id, cause);
    return NextResponse.json(
      { error: "Could not finish setting up your account. Try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, redirectTo: "/map" }, { status: 201 });
}
