/**
 * Turning a Supabase auth failure into a sentence a resident can act on.
 *
 * Client-safe on purpose — same import budget as `format-alert.ts` and
 * `date-range.ts`: nothing that touches Prisma, a secret or `node:`. Two of the
 * places an auth error surfaces are in the browser (`resetPasswordForEmail` and
 * `signInWithOAuth` are both called from the browser client, because they start
 * PKCE and store a verifier the callback has to read back), and the rest are
 * Route Handlers. One mapper for both, or the same failure gets two different
 * sentences depending on which half of the flow it happened in.
 *
 * **Why this module exists.** `POST /api/auth/register` passed
 * `error.message` straight through to the browser, where the register form
 * raises it as a toast. Supabase's own wording for an exhausted email quota is
 * the bare string "email rate limit exceeded" — which reached residents as a red
 * popup naming an internal quota, at the exact moment they were trying to join
 * their village. It reads as a fault in their details rather than a fact about
 * the deployment's mail allowance, so the useful action (wait a few minutes) is
 * the one thing it does not suggest.
 *
 * **Nothing here ever returns a provider message.** Every path ends at one of
 * the constants below. A pass-through is how an internal identifier ends up on
 * screen — and Supabase's auth errors are not written for the person who
 * triggered them, they are written for whoever is reading the logs.
 *
 * See `docs/SUPABASE_EMAIL_SETUP.md` for the two dashboard settings that stop
 * the underlying limit being hit in the first place.
 */

/** Which flow the failure happened in. Decides the wording, nothing else. */
export type AuthFlow =
  | "signup"
  | "signin"
  | "otp"
  | "reset-request"
  | "reset-update"
  | "resend"
  | "oauth";

/**
 * The shape of the thing we are given. Deliberately not `AuthError` from
 * `@supabase/supabase-js`: this also has to narrow a plain `unknown` caught
 * from a `fetch`, and a type that only admitted the SDK's class would push a
 * cast onto every call site.
 */
export type AuthErrorLike = unknown;

/**
 * How long to hold the button for when the failure is a rate limit and the
 * provider did not say how long to wait. Five minutes matches the wording —
 * "in a few minutes" — rather than being a guess at the window's real length,
 * which is a project setting we cannot read from here.
 */
export const AUTH_RETRY_FALLBACK_SECONDS = 300;

/**
 * The longest a form waits for an auth request before it gives up, re-enables
 * the button and says so. Generous enough for a slow mobile connection on a
 * village edge-of-signal, short enough that a hung request does not leave
 * somebody looking at a dead button with no way forward.
 */
export const AUTH_REQUEST_TIMEOUT_MS = 30_000;

/**
 * Supabase's own error codes for the limits we care about.
 *
 * `over_email_send_rate_limit` is the per-address one ("too many emails have
 * been sent to this address"); `over_request_rate_limit` is the per-client one.
 * The project-wide email quota — the one an operator raises under Auth → Rate
 * Limits, and the one behind the report this module was written for — arrives
 * as a 429 whose message is the bare string matched in `EMAIL_QUOTA_PATTERN`.
 */
const RATE_LIMIT_CODES = new Set([
  "over_email_send_rate_limit",
  "over_sms_send_rate_limit",
  "over_request_rate_limit",
  "rate_limit_exceeded",
  "too_many_requests",
]);

const RATE_LIMIT_PATTERNS = [
  /rate limit/i,
  /rate_limit/i,
  /too many requests/i,
  /too many emails/i,
  // "For security purposes, you can only request this after 47 seconds."
  /you can only request this after/i,
];

/**
 * The project-wide email quota, and only that.
 *
 * Kept separate from `isRateLimitError` because one screen cannot use the
 * general test: `/forgot-password` must not disclose whether an address has an
 * account (see `ForgotPasswordForm`), and the per-address limit is a fact about
 * the address. This pattern matches the quota message, which is the same for
 * every address on the deployment and therefore says nothing about any of them.
 */
const EMAIL_QUOTA_PATTERN = /email rate limit exceeded/i;

function readMessage(error: AuthErrorLike): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const { message } = error as { message?: unknown };
    if (typeof message === "string") return message;
  }
  return "";
}

function readStatus(error: AuthErrorLike): number | null {
  if (error && typeof error === "object") {
    const { status } = error as { status?: unknown };
    if (typeof status === "number") return status;
  }
  return null;
}

function readCode(error: AuthErrorLike): string {
  if (error && typeof error === "object" && "code" in error) {
    const { code } = error as { code?: unknown };
    if (typeof code === "string") return code.toLowerCase();
  }
  return "";
}

/**
 * Is this failure a rate limit — of any kind, from any of the three places one
 * can come from (the status, the code, or the wording)?
 *
 * All three are checked because none of them is reliable on its own: the SDK
 * has carried `code` only since v2.39, older deployments and the REST fallback
 * return the message alone, and a 429 can arrive from a proxy in front of
 * Supabase with neither field set.
 */
export function isRateLimitError(error: AuthErrorLike): boolean {
  if (readStatus(error) === 429) return true;
  if (RATE_LIMIT_CODES.has(readCode(error))) return true;

  const message = readMessage(error);
  return RATE_LIMIT_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Is this the deployment's hourly email quota, rather than a limit that
 * describes one address?
 *
 * Errs towards false. A quota error that carried only the code and not the
 * message would answer false here and be swallowed by `/forgot-password` into
 * its neutral panel — which is the safe direction to be wrong in, because the
 * other one is an account-enumeration oracle.
 */
export function isEmailQuotaError(error: AuthErrorLike): boolean {
  return EMAIL_QUOTA_PATTERN.test(readMessage(error));
}

/**
 * How long the provider asked us to wait, in seconds, or null if it did not
 * say. Supabase puts the figure in the message rather than in a header we can
 * read from the SDK: "For security purposes, you can only request this after 47
 * seconds."
 */
export function retryAfterSeconds(error: AuthErrorLike): number | null {
  const message = readMessage(error);

  const seconds = /(\d+)\s*second/i.exec(message);
  if (seconds) return Number(seconds[1]);

  const minutes = /(\d+)\s*minute/i.exec(message);
  if (minutes) return Number(minutes[1]) * 60;

  return null;
}

/** "in about 45 seconds" / "in about 3 minutes" / "in a few minutes". */
function waitPhrase(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return "in a few minutes";
  // Under a minute is worth saying exactly — it is short enough to wait out.
  // The boundary is 60 rather than something larger so that a wait just over a
  // minute reads as "1 minute" rather than as "75 seconds".
  if (seconds < 60) return `in about ${seconds} seconds`;

  const minutes = Math.round(seconds / 60);
  return `in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * The rate-limited sentence for a flow.
 *
 * Every one of them says the same two things: this is about volume rather than
 * about you, and waiting is what fixes it. The first half is what stops
 * somebody re-checking a password that was never wrong; the second is what
 * stops them hammering the button and spending the quota that is already gone.
 */
export function rateLimitMessage(
  flow: AuthFlow,
  seconds: number | null = null,
): string {
  const wait = waitPhrase(seconds);

  switch (flow) {
    case "signup":
      return `Too many sign-ups right now. Please try again ${wait} — nothing you typed has been lost.`;
    case "otp":
      return `Too many sign-in codes have been requested. Please try again ${wait}.`;
    case "reset-request":
      return `Too many reset emails have been requested. Please try again ${wait}.`;
    case "reset-update":
      return `Too many attempts right now. Please try again ${wait}.`;
    case "resend":
      return `Too many confirmation emails have been requested. Please try again ${wait}.`;
    case "signin":
    case "oauth":
      return `Too many sign-in attempts right now. Please try again ${wait}.`;
  }
}

/** What to say when the failure is not a rate limit and not otherwise known. */
function fallbackMessage(flow: AuthFlow): string {
  switch (flow) {
    case "signup":
      return "Could not create your account. Please try again.";
    case "otp":
      return "Could not send your sign-in code. Please try again.";
    case "reset-request":
      return "Could not send the reset email. Please try again.";
    case "reset-update":
      return "Could not change your password. Ask for a new link and try again.";
    case "resend":
      return "Could not send the confirmation email. Please try again.";
    case "signin":
      return "Could not sign you in. Please try again.";
    case "oauth":
      return "That sign-in could not be completed. Try again, or use your email and password.";
  }
}

/**
 * The whole answer about one failure: what to show, whether it was a rate
 * limit, and how long to hold the button for.
 *
 * `retryAfter` is null unless this was a rate limit — a cooldown on an ordinary
 * failure would be a form that punishes somebody for mistyping their password.
 */
export function describeAuthError(
  error: AuthErrorLike,
  flow: AuthFlow,
): { message: string; rateLimited: boolean; retryAfter: number | null } {
  if (!isRateLimitError(error)) {
    return { message: fallbackMessage(flow), rateLimited: false, retryAfter: null };
  }

  const seconds = retryAfterSeconds(error);

  return {
    message: rateLimitMessage(flow, seconds),
    rateLimited: true,
    retryAfter: seconds ?? AUTH_RETRY_FALLBACK_SECONDS,
  };
}

/** Just the sentence, for a caller with nothing to do with the rest. */
export function authErrorMessage(error: AuthErrorLike, flow: AuthFlow): string {
  return describeAuthError(error, flow).message;
}

/**
 * What a thrown `fetch` means to a resident.
 *
 * The forms abort their own request at `AUTH_REQUEST_TIMEOUT_MS`, which arrives
 * here as a `TimeoutError` rather than as a network failure — and the two want
 * different advice. "Check your connection" is unhelpful to somebody whose
 * connection is fine and whose request is simply slow.
 */
export function requestErrorMessage(cause: unknown): string {
  const name =
    cause && typeof cause === "object" && "name" in cause
      ? String((cause as { name?: unknown }).name)
      : "";

  if (name === "TimeoutError") {
    return "That took too long. Check your connection and try again.";
  }

  return "Network error — check your connection and try again";
}
