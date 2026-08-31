import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isSupabaseConfigured,
} from "@/lib/supabase/env";
import {
  SUPABASE_COOKIE_OPTIONS,
  withCookieLifetime,
} from "@/lib/supabase/cookie-options";
import { buildContentSecurityPolicy, isCspReportOnly } from "@/lib/csp";
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

/**
 * The two service worker scripts, which are served **without** a CSP.
 *
 * A worker is governed by the policy delivered with its own script, not by the
 * page's — and `public/onesignal/OneSignalSDKWorker.js` does exactly one thing:
 * `importScripts()` from `cdn.onesignal.com`. `importScripts` is checked against
 * `script-src`, where there are no nonces to inherit, so `'strict-dynamic'`
 * makes the host list inert and the import is refused. The result is an
 * initialisation that reports itself healthy and never delivers a notification
 * — the same silent failure the dashboard's worker path already has, arriving
 * by a second route.
 *
 * Excluding them costs nothing. Both are static, same-origin, first-party files
 * in `public/`; neither renders markup and neither has a document to protect.
 */
const UNPOLICED_SCRIPTS = ["/sw.js", "/onesignal/"];

function isProtected(pathname: string) {
  return PROTECTED_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

/**
 * Attaches the policy to a response on its way out.
 *
 * Every `return` in `proxy()` goes through this, including the two early ones
 * and both redirects. A CSP that covers the ordinary path and not the redirect
 * to `/login` is a CSP with a hole in exactly the response an attacker would
 * rather land on.
 *
 * The header name differs between the request and the response on purpose. Next
 * discovers the nonce by parsing the **request**'s `Content-Security-Policy`, so
 * that one is always the enforcing name, whatever mode we are in — otherwise
 * report-only would test a policy whose scripts carry no nonce, which is not the
 * policy we would later enforce. The **response** carries whichever name
 * `CSP_REPORT_ONLY` asks for, and that is the one the browser acts on.
 */
function withCsp(response: NextResponse, nonce: string | null) {
  if (!nonce) return response;

  response.headers.set(
    isCspReportOnly()
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy",
    buildContentSecurityPolicy(nonce),
  );

  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const policed = !UNPOLICED_SCRIPTS.some((path) => pathname.startsWith(path));
  const nonce = policed
    ? Buffer.from(crypto.randomUUID()).toString("base64")
    : null;

  /**
   * Next reads the nonce off the **request** and puts it on its own script
   * tags, so it has to travel forward on the headers each
   * `NextResponse.next({ request })` below is given.
   *
   * A function rather than one object built here, and the difference is not
   * cosmetic. `setAll` writes the refreshed session cookies with
   * `request.cookies.set(…)`, which rewrites the request's own `cookie` header
   * — that is how a Server Component downstream sees a token the proxy has just
   * renewed. A `Headers` snapshot taken at the top of this function is taken
   * before that write, so forwarding it would hand the render the *stale*
   * cookies and silently undo the refresh this proxy exists to perform. Reading
   * `request.headers` at call time is what keeps both.
   */
  const forwarded = () => {
    const headers = new Headers(request.headers);

    if (nonce) {
      headers.set("x-nonce", nonce);
      headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));
    }

    return { headers };
  };

  // Auth API routes manage their own cookies and must stay reachable.
  if (pathname.startsWith("/api/")) {
    return withCsp(NextResponse.next({ request: forwarded() }), nonce);
  }

  // Nothing to guard against until Supabase is configured.
  if (!isSupabaseConfigured) {
    return withCsp(NextResponse.next({ request: forwarded() }), nonce);
  }

  let response = NextResponse.next({ request: forwarded() });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // Must match `src/lib/supabase/server.ts` exactly. This runs on nearly every
    // navigation and rewrites the session cookies, so a flag set there and not
    // here is one the next page load quietly undoes. See the module.
    cookieOptions: SUPABASE_COOKIE_OPTIONS,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request: forwarded() });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, withCookieLifetime(options));
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
    return withCsp(NextResponse.redirect(url), nonce);
  }

  if (user && AUTH_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/map";
    url.search = "";
    return withCsp(NextResponse.redirect(url), nonce);
  }

  return withCsp(response, nonce);
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
