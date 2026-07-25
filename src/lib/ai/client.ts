import Anthropic from "@anthropic-ai/sdk";

/**
 * The Anthropic client. **Server only** — `ANTHROPIC_API_KEY` has no
 * `NEXT_PUBLIC_` prefix, so importing this from a Client Component would either
 * fail or, worse, ship an empty key and silently disable the AI pass.
 *
 * Nothing here throws on import. The whole AI pipeline degrades to "not
 * configured" when the key is missing, because a fresh clone with no Anthropic
 * account still has to build and still has to let someone file a report — it
 * just files it un-anonymised into `PENDING_REVIEW`, which is where Day 2 left
 * it.
 */

const API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

export const isAiConfigured = API_KEY.length > 0;

/**
 * Sonnet is the right tier here: this is extraction and rewriting against a
 * fixed schema, not open-ended reasoning, and the architecture doc budgets
 * under 8 seconds for the whole round trip. Overridable so a village that wants
 * a different tradeoff can set it per deployment.
 */
export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5";

let cached: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (!isAiConfigured) {
    throw new Error(
      "Anthropic is not configured. Set ANTHROPIC_API_KEY in .env.local.",
    );
  }

  cached ??= new Anthropic({
    apiKey: API_KEY,
    // Milliseconds in the TypeScript SDK, unlike the Python one. A reporter is
    // standing outdoors waiting for this, so a request that has not come back
    // in 30s is worth abandoning — the wizard falls back to their own wording.
    timeout: 30_000,
    // One retry covers a transient 529. More would push past the point where
    // the reporter has given up and pressed the button again.
    maxRetries: 1,
  });

  return cached;
}
