import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * The shared gate on every scheduled route. **Server only.**
 *
 * Both cron endpoints are unauthenticated in the ordinary sense — nobody is
 * signed in at 09:00 on a Sunday — so the only thing standing between them and
 * the open internet is `CRON_SECRET`. That matters more than it looks:
 * `/api/digest` spends Anthropic credit and pushes to every coordinator, and
 * `/api/cron/retention` **deletes files and takes reports off the map**. An
 * unauthenticated caller who could trigger either one would be expensive in the
 * first case and destructive in the second.
 *
 * Two properties are load-bearing:
 *
 * - **It fails closed.** With no secret configured every request is refused,
 *   including the real cron's. A deployment that forgot the variable gets no
 *   digest, which is visible in the Vercel cron log; the alternative — an open
 *   endpoint — is not visible at all until someone finds it.
 * - **The comparison is constant time.** A byte-by-byte early return leaks the
 *   secret one character at a time to anyone who can measure the response.
 *
 * Extracted from `/api/digest` on Day 6 rather than copied into the retention
 * route: this is the kind of check that drifts when it exists twice, and the
 * copy that drifts is the one nobody reads again.
 */

/**
 * Whether the request carries the shared secret.
 *
 * Vercel Cron sends it as `Authorization: Bearer $CRON_SECRET`. A bare value in
 * the same header is accepted too, because that is what `curl -H "Authorization:
 * $CRON_SECRET"` sends and it is how these routes get tested by hand.
 */
export function isCronAuthorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";

  if (secret.length === 0) return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : header;

  const a = Buffer.from(provided);
  const b = Buffer.from(secret);

  // `timingSafeEqual` throws on a length mismatch, and the throw would itself
  // leak the secret's length — compare lengths first, then always run the full
  // comparison.
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * The 401 both scheduled routes return.
 *
 * Deliberately says nothing about whether a secret is configured, whether one
 * was sent, or whether it was the wrong length. A caller probing the endpoint
 * learns only that they are not the cron.
 */
export function cronUnauthorised(): NextResponse {
  return NextResponse.json({ error: "Not authorised" }, { status: 401 });
}
