import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { completeProfileSchema, fieldErrors } from "@/lib/validations";
import { fuzzCoordinates } from "@/lib/geo";
import { HOME_LOCATION_FUZZ_METERS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";
import { checkVillageJoin } from "@/lib/villages";

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
 * `role` and `verifiedAt` are derived from a join code checked against the
 * database (domain rule 5), exactly as the register route derives them — by
 * calling the same `checkVillageJoin`. There is no path by which a payload can
 * ask for a role, and since both paths now share one check there is no longer a
 * second copy of the comparison to drift from the first. Both copies used to let
 * a blank code through; see `checkVillageJoin` for what that bought.
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
        role: verified ? "VERIFIED_RESIDENT" : "RESIDENT",
        verifiedAt: verified ? new Date() : null,
      },
    });
  } catch (cause) {
    console.error("Failed to create profile for %s", session.user.id, cause);
    return NextResponse.json(
      { error: "Could not finish setting up your account. Try again." },
      { status: 500 },
    );
  }

  // The provider half of the same event the register route announces. Both
  // paths create a resident, so both tell the staff channel — an alert that
  // fired only for password sign-ups would quietly under-count the village.
  await notifySlack(
    `🆕 New user: ${fullName} (${email}) joined ${village.name}`,
  );

  return NextResponse.json({ ok: true, redirectTo: "/map" }, { status: 201 });
}
