import { headers } from "next/headers";

/**
 * Where an audited action came from: the caller's address and their browser.
 *
 * **Server only** — `next/headers` is not available in the browser.
 *
 * ## Why this exists rather than two more `request.headers.get()` calls
 *
 * `AuditLog.ipAddress` and `.userAgent` have been columns since the init
 * migration, and every audit row written from a **route handler** fills them:
 * `POST /api/incidents`, the CSV export, the PDF report and the re-send in
 * `POST /api/notifications` all read them off the `NextRequest` they were handed.
 * Every row written from a **server action** did not, because a server action has
 * no `request` argument — so the three actions that matter most in the trail
 * (publishing a report, rejecting one, and reading a reporter's verbatim words)
 * were the three with no address against them.
 *
 * That is the wrong way round. A publish is the moment a report becomes visible
 * to a few hundred neighbours and `incident.raw_viewed` is the only record that
 * anybody read a resident's unedited words (domain rule 1) — those are precisely
 * the rows a coordinator's account being borrowed would show up in, and an entry
 * with no address is one that cannot be told apart from any other.
 *
 * ## It resolves the context rather than taking it as an argument
 *
 * The obvious alternative is a `context` parameter threaded from each server
 * action. It was rejected for the reason this codebase gives elsewhere for
 * sharing a check rather than repeating it: an optional argument is one a new
 * call site can leave out, and the failure is silent — a trail that looks
 * complete and is missing the row somebody needs. Resolving it inside
 * `applyModeration` and `readRawDescription` means there is no call site that
 * can forget, which is the same argument `moderation.ts` makes for owning the
 * audit write in the first place.
 *
 * ## Never throws
 *
 * `headers()` is available in a Server Component, a Server Action and a Route
 * Handler, which covers every caller in the app — but an audit row with nulls in
 * two columns is worth far more than a publish that failed because a header
 * could not be read. Both fields are nullable in the schema and were null on
 * every one of these rows until now, so the fallback is the old behaviour rather
 * than a new failure mode.
 */
export type AuditContext = {
  ipAddress: string | null;
  userAgent: string | null;
};

/** Nothing known about the caller — the value every one of these rows had. */
const UNKNOWN: AuditContext = { ipAddress: null, userAgent: null };

/**
 * The caller's address and browser, for an `AuditLog` row.
 *
 * `x-forwarded-for` rather than a socket address, matching the four route
 * handlers that already write these columns: on Vercel every request arrives
 * through the edge proxy, so the socket is the proxy's. The header can carry a
 * comma-separated chain when there is more than one proxy in front of us, and
 * the **first** entry is the client — the rest are the hops. Route handlers
 * store the raw header today; this takes the first entry, because a trail is
 * read by a person and `1.2.3.4, 10.0.0.1, 10.0.0.2` in a column labelled "IP"
 * is three answers to a question with one.
 */
export async function auditContext(): Promise<AuditContext> {
  try {
    const store = await headers();
    const forwarded = store.get("x-forwarded-for");

    return {
      ipAddress: forwarded?.split(",")[0]?.trim() || null,
      userAgent: store.get("user-agent"),
    };
  } catch (cause) {
    // Outside a request scope. Nothing to record, and nothing worth failing an
    // action that has already happened over.
    console.error("Could not read the request context for an audit row", cause);
    return UNKNOWN;
  }
}
