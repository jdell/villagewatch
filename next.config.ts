import type { NextConfig } from "next";

/**
 * Security headers, applied to every response.
 *
 * These live here rather than in `vercel.json` for two reasons: they apply in
 * `npm run dev` too, so a header that breaks the map breaks it on the machine
 * of whoever wrote it; and they survive a move off Vercel, which a parish
 * council self-hosting for one village might well make.
 *
 * A Content-Security-Policy is deliberately not here. It has to be built with
 * a per-request nonce to work with the App Router's inline bootstrap script,
 * which means `src/proxy.ts` rather than a static list — see
 * `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.
 * A CSP added as a static string here would either break Leaflet and the
 * OneSignal SDK or be so wide it protected nothing.
 */
const SECURITY_HEADERS = [
  {
    /**
     * Nothing in VillageWatch should ever be framed. A village map inside
     * someone else's page is a clickjacking surface, and the moderation queue
     * inside one is worse.
     *
     * `X-Frame-Options` is the older of the two mechanisms and still the one
     * every browser honours; `frame-ancestors` in a CSP would supersede it once
     * that arrives.
     */
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    /**
     * Stops a browser second-guessing a Content-Type. Uploaded media is served
     * from Supabase Storage through signed URLs, and a redacted photo that a
     * browser decides to sniff as HTML is a stored XSS.
     */
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    /**
     * Full URL to our own origin, origin only to anyone else, nothing at all
     * over plain HTTP.
     *
     * This matters more here than on most sites: incident URLs carry an id, and
     * the OpenStreetMap tile requests the map makes are cross-origin. Without
     * this, `/incidents/<uuid>` would travel to a tile server in a Referer
     * header.
     */
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    /**
     * Two years, subdomains included, and preload-eligible.
     *
     * `preload` is a commitment: once the domain is submitted to the HSTS
     * preload list, every browser refuses plain HTTP to it and to every
     * subdomain, and getting off the list takes months. Keep the directive only
     * if the council is certain nothing on a subdomain will ever need to be
     * served over HTTP.
     */
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    /**
     * `(self)` where the app genuinely uses the capability, `()` — nobody, not
     * even us — everywhere else.
     *
     * - `geolocation`: the "Use my location" button in the location picker.
     * - `camera`: the report wizard asks a phone to open its camera for an
     *   attachment.
     * - `microphone`: kept alongside camera for video attachments with sound.
     *
     * Every one of these is denied to third-party iframes, which is the point:
     * an embedded widget must not be able to ask a resident for their location
     * under VillageWatch's name.
     */
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "autoplay=()",
      "camera=(self)",
      "display-capture=()",
      "encrypted-media=()",
      "fullscreen=(self)",
      "geolocation=(self)",
      "gyroscope=()",
      "magnetometer=()",
      "microphone=(self)",
      "midi=()",
      "payment=()",
      "usb=()",
      "xr-spatial-tracking=()",
    ].join(", "),
  },
  {
    /**
     * Keeps this origin out of the browsing-context group of anything that
     * opens it, so a page with a link to VillageWatch cannot reach into it
     * through `window.opener`.
     */
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    /** Nothing here is meant to be embedded as a subresource by another site. */
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
];

const nextConfig: NextConfig = {
  /** No `X-Powered-By: Next.js`. Free information for an attacker, no use to us. */
  poweredByHeader: false,

  /**
   * `/dashboard/compliance` renders `docs/DPIA.md`, `docs/APD_TEMPLATE.md` and
   * `docs/DATA_PROCESSING_AGREEMENT.md` from disk — the coordinator accepts
   * those documents on their council's behalf, so the page shows the real files
   * rather than a restatement of them (see `src/lib/compliance-documents.ts`).
   *
   * None of them is imported by any module, so Next's file tracing has no way to
   * know the serverless function needs them and would not bundle them. Without
   * these lines the page builds, deploys, and fails **only in production**,
   * because `npm run dev` reads straight from the working tree.
   *
   * Add a compliance document and add it here in the same commit.
   */
  outputFileTracingIncludes: {
    "/dashboard/compliance": [
      "./docs/DPIA.md",
      "./docs/APD_TEMPLATE.md",
      "./docs/DATA_PROCESSING_AGREEMENT.md",
    ],
  },

  async headers() {
    return [
      {
        // Everything, including API routes and static assets.
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      {
        /**
         * Nothing under `/api` should ever be cached — by a browser, by
         * Vercel's edge, or by whatever proxy a rural broadband provider has
         * put in the way. The CSV export in particular is one village's
         * reports, and a cached copy served to the next caller would be a
         * cross-tenant leak that no amount of `villageId` scoping would catch.
         */
        source: "/api/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, max-age=0",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
