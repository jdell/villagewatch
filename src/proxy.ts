import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isSupabaseConfigured,
} from "@/lib/supabase/env";
import { PROTECTED_ROUTES } from "@/lib/constants";

/**
 * Next.js 16 renamed `middleware.ts` to `proxy.ts`. Same runtime, same
 * matcher semantics — only the filename and the exported function changed.
 *
 * Two jobs here:
 *   1. Refresh the Supabase session cookies so Server Components downstream
 *      always see a valid token.
 *   2. Optimistic auth routing — bounce signed-out users off app routes and
 *      signed-in users off the login/register pages.
 *
 * This is a redirect convenience, NOT the authorisation boundary. Every page
 * and route handler still calls `requireSession()` / `requireRole()`, and the
 * database enforces access with RLS.
 */

const AUTH_ROUTES = ["/login", "/register"];

/**
 * Signed in, but possibly without a profile row — so it cannot be bounced to
 * /map like the auth routes above, and it cannot live in `PROTECTED_ROUTES`
 * either, because the app layout redirects an incomplete account *to* here and
 * a proxy rule sending it back would loop. Signed-out visitors are turned away
 * by `requireSession()` on the page itself.
 */
const ONBOARDING_ROUTE = "/welcome";

function isProtected(pathname: string) {
  return PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Auth API routes manage their own cookies and must stay reachable.
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Nothing to guard against until Supabase is configured.
  if (!isSupabaseConfigured) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Do not remove: this call is what refreshes an expired access token.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && (isProtected(pathname) || pathname === ONBOARDING_ROUTE)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && AUTH_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/map";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files — the proxy runs on
     * navigations, not on every chunk request.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)",
  ],
};
