import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fieldErrors, loginSchema } from "@/lib/validations";
import { prisma } from "@/lib/prisma";

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
    // Deliberately vague: do not reveal whether the email exists.
    return NextResponse.json(
      { error: "Email or password is incorrect" },
      { status: 401 },
    );
  }

  if (process.env.DATABASE_URL) {
    await prisma.user.updateMany({
      where: { id: data.user.id },
      data: { lastActiveAt: new Date() },
    });
  }

  return NextResponse.json({ ok: true, redirectTo: next ?? "/map" });
}
