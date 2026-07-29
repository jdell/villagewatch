import type { MetadataRoute } from "next";
import { APP_ORIGIN } from "@/lib/constants";

/**
 * `/robots.txt`, generated rather than committed to `public/`.
 *
 * A file convention rather than a static file for one reason: the sitemap line
 * has to carry an absolute URL, and a preview deployment pointing crawlers at
 * production's sitemap is how a staging host ends up in the index. This reads
 * the same `NEXT_PUBLIC_APP_URL ?? APP_ORIGIN` pair the root layout's
 * `metadataBase` does, so all three agree by construction.
 *
 * ## This is not a security boundary
 *
 * Nothing here protects anything. `/dashboard` is guarded by
 * `requireCoordinator()` and `/api` by its own handlers; a disallow line is a
 * request to well-behaved crawlers and is ignored by everybody else. What it
 * actually buys is that a village's authenticated surfaces do not turn up in
 * search results as login redirects, and that crawl budget is spent on the four
 * pages that are meant to be found.
 *
 * The disallow list is deliberately **not** `PROTECTED_ROUTES`. That constant
 * is the proxy's denylist and answers a different question — it does not
 * include `/api`, `/join` or `/invite`, none of which need a session, and two
 * of which carry a join code in the query string.
 */
export default function robots(): MetadataRoute.Robots {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? APP_ORIGIN;

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Every authenticated surface. One village's data rendered for one
          // signed-in resident — see the note on `public/sw.js` never caching
          // HTML, which is the same reasoning applied to a different cache.
          "/dashboard",
          "/admin",
          "/incidents",
          "/map",
          "/settings",
          "/reports",
          "/coordinator-apply",
          "/welcome",

          // Route handlers. Nothing here renders, so a crawl only spends our
          // rate limits and fills logs with 401s.
          "/api/",

          // The invite pages. Both are already `noindex` in their own metadata
          // — this is the belt to that pair of braces, and it matters more than
          // usual: the URLs carry a village's join code in the query string,
          // and an indexed one is a credential nobody can rotate out of a
          // search cache.
          "/join/",
          "/invite/",

          // Dead ends for a searcher: a session or a one-time token is what
          // makes each of them render anything.
          "/reset-password",
          "/account-closed",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
