/**
 * The Content-Security-Policy, built per request — VW-02.
 *
 * It lives here rather than in `next.config.ts` beside the other security
 * headers, and that is forced rather than chosen: the App Router serves an
 * inline bootstrap script on every page, so a policy strict enough to be worth
 * having needs a fresh nonce per response. `next.config.ts` emits a static list
 * and cannot produce one. Its comment has said so — and said a CSP was
 * deliberately deferred for that reason — since the header set was written; the
 * deferral is what VW-02 finally calls in.
 *
 * Read `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`
 * before changing anything here. Two things in it are load-bearing and neither
 * is obvious: Next finds the nonce by parsing the **request**'s
 * `Content-Security-Policy` header for the `'nonce-…'` pattern and applies it to
 * its own script tags automatically, and a nonced CSP makes every page
 * dynamically rendered, because a page built at build time has no request to
 * take a nonce from.
 */

/**
 * Where the third-party code on an authenticated page actually comes from.
 *
 * Every entry is a URL that exists in the source rather than one that seemed
 * likely, and the file it is written in is named. Change one of those files and
 * change this list in the same commit — a missing origin here is a feature that
 * fails in the browser with nothing in the server log to say why.
 */
const ORIGINS = {
  /** Auth, Storage signed URLs, and the realtime socket the client opens. */
  supabase: ["https://*.supabase.co", "wss://*.supabase.co"],
  /** `src/components/push-registration.tsx` — the v16 web SDK. */
  onesignalScript: "https://cdn.onesignal.com",
  /** The SDK's own API calls, and the subdomain it may fall back to. */
  onesignalApi: ["https://*.onesignal.com", "https://*.os.tc"],
  /**
   * `src/lib/media/face-blur.ts` — the MediaPipe WASM runtime, overridable with
   * `NEXT_PUBLIC_MEDIAPIPE_WASM_PATH`. It is in **`script-src` as well as
   * `connect-src`**, which the audit's sketch did not have: `FilesetResolver`
   * loads the WASM glue with `document.createElement("script")`, so listing it
   * only as a fetch destination blocks face detection outright.
   */
  mediapipeWasm: "https://cdn.jsdelivr.net",
  /** The BlazeFace model, `NEXT_PUBLIC_FACE_MODEL_URL`. Fetched, not executed. */
  mediapipeModel: "https://storage.googleapis.com",
  /** `MAP_CONFIG.tileUrl` in `src/lib/constants.ts`. */
  tiles: "https://*.tile.openstreetmap.org",
} as const;

/**
 * Builds the policy for one request.
 *
 * `nonce` is generated per request by `src/proxy.ts` and must never be reused —
 * a predictable nonce is a policy an injected script can satisfy.
 */
export function buildContentSecurityPolicy(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";

  const directives = [
    // Everything not named below. `'self'` and nothing else, which is what
    // makes the named exceptions the whole of the third-party surface.
    `default-src 'self'`,

    [
      "script-src",
      `'self'`,
      `'nonce-${nonce}'`,
      /**
       * `'strict-dynamic'` is what makes this policy hold up. Trust propagates
       * from a nonced script to whatever it loads, which is how `next/script`
       * gets the OneSignal SDK in and how the SDK then loads its own chunks —
       * without it, every dynamically injected script would need its host
       * enumerated here and the policy would be an allowlist of CDNs rather
       * than a constraint.
       *
       * The catch, and it is the one that makes this look wrong on a first
       * read: a browser that honours `'strict-dynamic'` **ignores every host
       * expression in this directive**. The three below are therefore dead
       * weight in Chrome and Firefox, and are the entire policy in a CSP2-only
       * browser that ignores `'strict-dynamic'` instead. Both halves are
       * deliberate; neither is sufficient alone.
       */
      `'strict-dynamic'`,
      /**
       * WebAssembly compilation, and the single directive whose absence would
       * do real damage rather than break a feature. MediaPipe's face detector
       * is WASM, `POST /api/incidents/media` has **no server-side fallback on
       * purpose** (domain rule 3), and the wizard's failure mode is a resident
       * unable to attach a photograph at all. Not `'unsafe-eval'`: this permits
       * `WebAssembly.instantiate` and nothing else.
       */
      `'wasm-unsafe-eval'`,
      ORIGINS.onesignalScript,
      ORIGINS.mediapipeWasm,
      /**
       * React reconstructs server-side error stacks in the browser with `eval`
       * in development, and only there. Next's own CSP guide says the same.
       */
      ...(isDev ? [`'unsafe-eval'`] : []),
    ].join(" "),

    /**
     * `'unsafe-inline'` rather than the nonce, and this is the one concession
     * in the policy worth stating plainly instead of hiding in a list.
     *
     * A nonce covers `<style>` elements. It does not cover the `style="…"`
     * **attribute**, which is what React emits for every `style={{…}}` prop —
     * the heatmap legend's gradient, the dashboard's breakdown bars, the
     * privacy-level previews, and Leaflet's own positioning. Nonce-only
     * `style-src` would blank all four with no way to nonce them individually.
     *
     * What it costs is small and worth naming: CSS injection can restyle a
     * page, and cannot execute script. The XSS this policy exists to stop is
     * governed by `script-src`, which takes no such concession.
     */
    `style-src 'self' 'unsafe-inline'`,

    [
      "img-src",
      `'self'`,
      // The blurred canvas output, before it is uploaded.
      "blob:",
      // Inline stills and the QR canvas.
      "data:",
      ...ORIGINS.supabase,
      ORIGINS.tiles,
    ].join(" "),

    [
      "connect-src",
      `'self'`,
      ...ORIGINS.supabase,
      ...ORIGINS.onesignalApi,
      // The WASM binary, alongside the glue script in `script-src`.
      ORIGINS.mediapipeWasm,
      ORIGINS.mediapipeModel,
    ].join(" "),

    /**
     * Both service workers — `public/sw.js` at the root scope and OneSignal's
     * under `/onesignal/` — are same-origin files. See `withCsp` in
     * `src/proxy.ts` for why the *worker scripts themselves* are served without
     * this header.
     */
    `worker-src 'self' blob:`,

    /** `next/font/google` self-hosts at build time, so there is no font origin. */
    `font-src 'self'`,

    /** The web app manifest, same-origin. */
    `manifest-src 'self'`,

    /**
     * Nothing here is meant to be framed, and nothing here frames anything.
     * `frame-ancestors` is the modern half of the `X-Frame-Options: DENY`
     * already set in `next.config.ts`; both are kept, because the older header
     * is the one every browser honours.
     */
    `frame-ancestors 'none'`,
    `frame-src 'none'`,

    /** No plugins, ever. */
    `object-src 'none'`,

    /** An injected `<base>` would repoint every relative URL on the page. */
    `base-uri 'self'`,

    /**
     * Every form in the app posts to the app. The Google and password-recovery
     * legs are navigations rather than form posts and are unaffected.
     */
    `form-action 'self'`,

    /**
     * Production only, and enforcing only.
     *
     * Browsers exempt `localhost` from the upgrade, so in development the
     * directive says something untrue of the dev server and does nothing. In
     * report-only mode it is worse than useless: the spec has no way to *report*
     * an upgrade that did not happen, so every browser logs
     * `'upgrade-insecure-requests' is ignored when delivered in a report-only
     * policy` as a console **error** on every page load. A fortnight of
     * report-only is only worth running if the console it fills is worth
     * reading, and a guaranteed error at the top of it is how the real
     * violations underneath get scrolled past.
     */
    ...(isDev || isCspReportOnly() ? [] : ["upgrade-insecure-requests"]),
  ];

  return directives.join("; ");
}

/**
 * Whether to report violations instead of blocking them.
 *
 * `CSP_REPORT_ONLY=true` sends the policy as `Content-Security-Policy-Report-Only`:
 * the browser logs every violation to its console and enforces nothing. The
 * audit recommends a fortnight of exactly this before switching over, and it is
 * right to — the origins above were read out of the source, but what a policy
 * catches is the request nobody knew the app made. On this deployment the
 * candidates are Leaflet's tile layer, whatever the OneSignal SDK loads after
 * its own bootstrap, and the third one, which is by definition not on the list.
 *
 * The nonce is applied to Next's scripts either way, because `withCsp` sets the
 * enforcing header name on the **request** whatever this returns — Next reads it
 * from there. Report mode changes only what the browser is told to do about it,
 * so a fortnight in report-only exercises the real policy rather than a
 * lookalike.
 */
export function isCspReportOnly(): boolean {
  return process.env.CSP_REPORT_ONLY === "true";
}
