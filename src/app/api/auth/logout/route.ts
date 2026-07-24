import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

/**
 * POST /api/auth/logout
 *
 * Clears the Supabase session cookies and returns the user to the landing
 * page. POST-only on purpose: a GET logout can be triggered by any image tag
 * or prefetch on a page the user visits.
 */
export async function POST(request: NextRequest) {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(new URL("/", request.url), {
    // 303 forces the browser to follow up with a GET.
    status: 303,
  });
}
