import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import pkg from "./package.json";

/**
 * Security headers, applied to every response.
 *
 * These live here rather than in `vercel.json` for two reasons: they apply in
 * `npm run dev` too, so a header that breaks the map breaks it on the machine
 * of whoever wrote it; and they survive a move off Vercel, which a parish
 * council self-hosting for one village might well make.
 *
 * The Content-Security-Policy is **not** in this list, and that is not the
 * deferral it used to be. It has to be built with a per-request nonce to work
 * with the App Router's inline bootstrap script, which means `src/proxy.ts`
 * rather than a static list — see
 * `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`.
 * A CSP added as a static string here would either break Leaflet and the
 * OneSignal SDK or be so wide it protected nothing. It lives in
 * `src/lib/csp.ts`, applied by the proxy on every response; VW-02 in
 * `docs/SECURITY_AUDIT_2026-08-29.md` is what closed the deferral.
 *
 * The two overlap in one place on purpose: `X-Frame-Options: DENY` below and
 * `frame-ancestors 'none'` in the policy say the same thing, and both stay. The
 * older header is the one every browser honours.
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
   * The running version, read out of `package.json` and inlined at build time.
   *
   * It is here rather than imported by the component that renders it because
   * `package.json` carries the whole dependency list: importing it from
   * `src/lib/constants.ts` would put that list — every package and every pinned
   * version this deployment runs — into the JavaScript sent to every browser.
   * A single string in `env` is inlined into both bundles instead.
   *
   * The environment wins where it is set, so a deployment can label itself
   * (a commit SHA, a staging marker) without editing the manifest. See
   * `APP_VERSION` in `src/lib/constants.ts` for why the number on a production
   * page can sit one patch behind `main`.
   */
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.NEXT_PUBLIC_APP_VERSION ?? pkg.version ?? "",
  },

  /**
   * `@react-pdf/renderer` is required by the server and bundled by nobody.
   *
   * It carries a fork of PDFKit, which reads its built-in font metrics from
   * binary blobs and resolves them through Node's own module machinery. A
   * bundler that inlines it either loses those files or rewrites the paths that
   * find them, and the failure is a route that builds cleanly and throws at the
   * first render — in production only, because `npm run dev` resolves from
   * `node_modules` anyway. Left external, it is required at run time as itself.
   *
   * This is a server-side concern with no client half:
   * `src/lib/report-pdf.tsx` is imported only by
   * `src/app/api/reports/[villageId]/pdf/route.ts`, and importing it from a
   * Client Component would put a PDF engine in a resident's browser.
   */
  serverExternalPackages: ["@react-pdf/renderer"],

  /**
   * `/dashboard/compliance` renders its documents from disk — the coordinator
   * accepts them on the council's behalf, or in a community village as the
   * controller themselves, so the page shows the real files rather than a
   * restatement of them (see `src/lib/compliance-documents.ts`). Which set is
   * rendered depends on `Village.mode`, so every file either mode can ask for
   * is named here.
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
      /**
       * The community model's single document. One route renders either set —
       * which one depends on `Village.mode`, which is a database read the
       * tracer cannot see — so all four are named here and the two a village
       * does not use simply sit in the bundle unread.
       */
      "./docs/COMMUNITY_DPA.md",
    ],
    /**
     * `/dashboard/guide` renders `docs/COORDINATOR_GUIDE.md` the same way, and
     * needs the same line for the same reason. It is not a compliance document
     * — nothing is accepted and nothing is gated on it — but the file is just as
     * invisible to the tracer.
     */
    "/dashboard/guide": ["./docs/COORDINATOR_GUIDE.md"],
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

/**
 * Sentry wraps the config rather than sitting inside it.
 *
 * `withSentryConfig` adds three things a plain option could not: the build-time
 * source map upload, the rewrite behind `tunnelRoute`, and the bundler plugins
 * that make a minified stack trace resolve back to this repository.
 *
 * **The build must still pass with none of these variables set**, and that is
 * not a nicety — `.github/workflows/ci.yml` runs `npm run build` with no
 * environment at all, which is the property the whole suite rests on. Without a
 * `SENTRY_AUTH_TOKEN` the plugin skips the upload and carries on; nothing here
 * throws on a missing value, and a fresh clone builds exactly as it did before.
 */
export default withSentryConfig(nextConfig, {
  /**
   * Both read from the environment, because neither is a secret and neither is
   * knowable from this repository — see `.env.example`. A wrong pair fails the
   * *upload* with a message in the build log and leaves the application
   * working, which is the right way round.
   */
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  /**
   * **The EU account is why this is here.** `sentryUrl` defaults to
   * `https://sentry.io/`, which is the US instance — so on an EU account the
   * source map upload authenticates against the wrong region and fails, while
   * the application itself reports perfectly well (the DSN carries its own
   * region). The result is a working deployment whose stack traces are all
   * minified, with the explanation buried in a build log. `SENTRY_URL` is the
   * variable, `https://de.sentry.io/` is the value for the EU.
   */
  sentryUrl: process.env.SENTRY_URL,

  authToken: process.env.SENTRY_AUTH_TOKEN,

  /**
   * The tunnel, and it earns its place twice over.
   *
   * The advertised reason is ad blockers, which drop requests to
   * `*.ingest.sentry.io` and take an unknown fraction of a village's error
   * reports with them. The reason that matters more here is the
   * Content-Security-Policy: `src/lib/csp.ts` is **enforced**, and its
   * `connect-src` is an allow-list. Routed through our own origin the browser
   * SDK is covered by the `'self'` already in that directive, so there is no
   * CSP line to add and therefore no CSP line to forget — and forgetting one
   * fails in the worst register available, with the vendor's "waiting for your
   * first event" screen looking identical to an application that never threw.
   *
   * It is a Next **rewrite**, not a route handler: do not add
   * `src/app/api/monitoring/route.ts` to match this, or it will shadow the
   * rewrite. `/api/:path*` already carries `Cache-Control: no-store` from the
   * headers above, which is right for it.
   */
  tunnelRoute: "/api/monitoring",

  sourcemaps: {
    /**
     * Uploaded, then deleted from the build output. This is the SDK's default
     * and it is written out because the alternative is the one that matters:
     * source maps left in `.next` are served to anybody who asks, which hands a
     * reader the unminified client source of a service whose security model
     * this repository spends several thousand words on.
     */
    deleteSourcemapsAfterUpload: true,
  },

  /**
   * Uploads the framework chunks as well as ours. Costs build time and upload
   * quota; buys a readable frame when the throw happens inside Next or React
   * rather than in `src/`, which is where the confusing ones happen.
   */
  widenClientFileUpload: true,

  /*
    `disableLogger` is deliberately **not** set, and it is the obvious thing to
    add. It tree-shakes the SDK's own logger out of the client bundle, which
    would be worth having on a PWA that rural broadband has to fetch — but the
    SDK's own deprecation notice says it is "not supported with Turbopack", and
    this project builds with Turbopack. Setting it would buy nothing, print a
    warning on every build, and leave a comment here claiming a saving that was
    not happening. Its replacement, `webpack.treeshake.removeDebugLogging`, is
    a webpack option and is no more use here for the same reason.
  */

  /** No build telemetry to Sentry. Nothing here needs to be counted by them. */
  telemetry: false,

  /**
   * Quiet in normal use, loud in CI where somebody is reading the log to find
   * out why an upload did not happen.
   */
  silent: !process.env.CI,
});
