import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The Content-Security-Policy — VW-02.
 *
 * The policy's *contents* are deliberately not asserted line by line: the origin
 * list is a description of what the app loads, it will move when a dependency
 * moves, and a test that failed whenever somebody added a CDN would be a test
 * people edit rather than read. `compliance-documents.test.ts` gives the fuller
 * version of that argument.
 *
 * What is pinned instead is the handful of directives whose absence would be
 * invisible until it cost something, and every one of them is a mistake a
 * reasonable tidying pass would make:
 *
 * - **`'wasm-unsafe-eval'`** looks like an `unsafe-` directive somebody should
 *   delete. Deleting it stops MediaPipe's face detector compiling, and
 *   `POST /api/incidents/media` has no server-side fallback by design (domain
 *   rule 3) — so the visible symptom is a reporter who cannot attach a
 *   photograph at all, and the invisible one is that this is the pipeline the
 *   privacy notice makes a promise about.
 * - **`cdn.jsdelivr.net` in `script-src`** looks redundant beside the same host
 *   in `connect-src`. It is not: `FilesetResolver` fetches the WASM glue by
 *   creating a script element.
 * - **`'unsafe-inline'` in `script-src`** is what a policy turns into when
 *   somebody chases a violation with the first fix that works. It would make the
 *   whole thing decorative.
 * - **The nonce reaching the header at all** is what Next parses to stamp its
 *   own script tags. Lose it and every page serves bare scripts under a policy
 *   that blocks them.
 *
 * `NODE_ENV` and `CSP_REPORT_ONLY` are both read at call time, so these can be
 * set per test rather than needing `vi.resetModules()` the way
 * `auth.test.ts` does for `ADMIN_EMAILS`.
 */

const NONCE = "dGVzdC1ub25jZQ==";

async function policy(env: Record<string, string> = {}) {
  // Clears first, so a call describing itself as production is production —
  // without it a `CSP_REPORT_ONLY` stubbed earlier in the same test leaks into
  // the next call and the assertion passes for the wrong reason.
  vi.unstubAllEnvs();

  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }

  const { buildContentSecurityPolicy } = await import("@/lib/csp");
  return buildContentSecurityPolicy(NONCE);
}

/** Pulls one directive out, so a test cannot match a token in a neighbour. */
function directive(csp: string, name: string): string {
  const found = csp
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));

  return found ?? "";
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the policy", () => {
  it("carries the nonce it was given", async () => {
    // Next finds the nonce by parsing this header off the request. No nonce,
    // no stamped scripts, and `'strict-dynamic'` then blocks all of them.
    expect(await policy()).toContain(`'nonce-${NONCE}'`);
  });

  it("permits WebAssembly, and does not permit eval to do it", async () => {
    const script = directive(await policy({ NODE_ENV: "production" }), "script-src");

    expect(script).toContain("'wasm-unsafe-eval'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it("never allows inline script", async () => {
    // The one concession this policy does not make. `style-src` does, and the
    // difference is that CSS injection restyles a page while script injection
    // is the thing the policy exists for.
    for (const env of [{ NODE_ENV: "production" }, { NODE_ENV: "development" }]) {
      expect(directive(await policy(env), "script-src")).not.toContain(
        "'unsafe-inline'",
      );
    }
  });

  it("lets MediaPipe both fetch and execute its runtime", async () => {
    const csp = await policy();

    // Two directives, one host, and the script one is the easy half to lose.
    expect(directive(csp, "script-src")).toContain("https://cdn.jsdelivr.net");
    expect(directive(csp, "connect-src")).toContain("https://cdn.jsdelivr.net");
  });

  it("shuts the doors that have no legitimate use here", async () => {
    const csp = await policy();

    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "base-uri")).toBe("base-uri 'self'");
    expect(directive(csp, "form-action")).toBe("form-action 'self'");
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
  });

  it("allows the map's tiles and the blurred canvas preview", async () => {
    const img = directive(await policy(), "img-src");

    expect(img).toContain("https://*.tile.openstreetmap.org");
    // The redacted output is a blob: URL before it is uploaded.
    expect(img).toContain("blob:");
  });
});

describe("development", () => {
  it("adds the eval React needs to rebuild a server stack, and only there", async () => {
    expect(
      directive(await policy({ NODE_ENV: "development" }), "script-src"),
    ).toContain("'unsafe-eval'");

    expect(
      directive(await policy({ NODE_ENV: "production" }), "script-src"),
    ).not.toContain("'unsafe-eval'");
  });

  it("does not claim to upgrade requests on a plain-HTTP dev server", async () => {
    expect(await policy({ NODE_ENV: "development" })).not.toContain(
      "upgrade-insecure-requests",
    );
  });
});

describe("report-only mode", () => {
  it("is off unless the variable says exactly true", async () => {
    const { isCspReportOnly } = await import("@/lib/csp");

    vi.stubEnv("CSP_REPORT_ONLY", "");
    expect(isCspReportOnly()).toBe(false);

    // Enforcing is the safe default, so anything ambiguous must not disarm it.
    vi.stubEnv("CSP_REPORT_ONLY", "1");
    expect(isCspReportOnly()).toBe(false);

    vi.stubEnv("CSP_REPORT_ONLY", "TRUE");
    expect(isCspReportOnly()).toBe(false);

    vi.stubEnv("CSP_REPORT_ONLY", "true");
    expect(isCspReportOnly()).toBe(true);
  });

  it("drops upgrade-insecure-requests, which cannot be reported", async () => {
    // Every browser logs it as a console *error* under a report-only policy, on
    // every page load. A fortnight of report-only is only worth running if the
    // console it fills is worth reading.
    expect(
      await policy({ NODE_ENV: "production", CSP_REPORT_ONLY: "true" }),
    ).not.toContain("upgrade-insecure-requests");

    expect(await policy({ NODE_ENV: "production" })).toContain(
      "upgrade-insecure-requests",
    );
  });

  it("changes nothing else about the policy", async () => {
    // The point of a report-only run is that it exercises the policy that will
    // later be enforced. Any other divergence makes the fortnight worthless.
    const enforced = await policy({ NODE_ENV: "production" });
    const reported = await policy({
      NODE_ENV: "production",
      CSP_REPORT_ONLY: "true",
    });

    expect(reported).toBe(
      enforced.replace("; upgrade-insecure-requests", ""),
    );
  });
});
