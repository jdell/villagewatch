import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fieldErrors, registerSchema } from "@/lib/validations";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/auth/register
 *
 * Creates the Supabase auth user, then the matching profile row. `User.id`
 * mirrors `auth.users.id` — the two must never drift.
 *
 * The village and role come from the server, never from the client payload
 * beyond the chosen village id: a resident cannot register themselves as a
 * coordinator by posting `role: "ADMIN"`.
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
  } = parsed.data;

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

  // A correct join code from the coordinator verifies the resident up front.
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

    return NextResponse.json(
      {
        error: alreadyRegistered
          ? "An account with that email already exists"
          : (error?.message ?? "Could not create your account"),
        ...(alreadyRegistered
          ? { fieldErrors: { email: "Try signing in instead" } }
          : {}),
      },
      { status: 400 },
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
        villageId: village.id,
        role: codeMatches ? "VERIFIED_RESIDENT" : "RESIDENT",
        verifiedAt: codeMatches ? new Date() : null,
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

  // With email confirmation enabled, signUp returns a user but no session.
  const needsEmailConfirmation = data.session === null;

  return NextResponse.json(
    { ok: true, needsEmailConfirmation, redirectTo: "/map" },
    { status: 201 },
  );
}
