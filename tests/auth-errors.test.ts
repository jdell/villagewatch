import { describe, expect, it } from "vitest";
import {
  AUTH_RETRY_FALLBACK_SECONDS,
  authErrorMessage,
  describeAuthError,
  isEmailQuotaError,
  isRateLimitError,
  rateLimitMessage,
  requestErrorMessage,
  retryAfterSeconds,
  type AuthFlow,
} from "@/lib/auth-errors";

/**
 * The mapper in front of every Supabase auth failure.
 *
 * What is asserted here is the promise rather than the wording: no provider
 * message ever reaches a resident, a rate limit is recognised however it
 * arrives, and the one screen that must not disclose whether an address has an
 * account can still tell a deployment-wide quota apart from a per-address
 * limit. The sentences themselves are copy and are deliberately not pinned —
 * the reasoning `compliance-documents.test.ts` gives for not asserting document
 * wording applies to this too.
 */

const FLOWS: AuthFlow[] = [
  "signup",
  "signin",
  "otp",
  "reset-request",
  "reset-update",
  "resend",
  "oauth",
];

/** The exact string Supabase returns when the hourly mail quota is spent. */
const EMAIL_QUOTA = "email rate limit exceeded";

/** The per-address one. Reachable only for an address mail was sent to. */
const PER_ADDRESS =
  "For security purposes, you can only request this after 47 seconds.";

describe("isRateLimitError", () => {
  it("recognises the quota message the register form was leaking", () => {
    expect(isRateLimitError({ message: EMAIL_QUOTA })).toBe(true);
  });

  it("recognises a 429 with nothing else on it", () => {
    // A proxy in front of Supabase can produce exactly this: no code, no
    // recognisable wording, just the status.
    expect(isRateLimitError({ status: 429, message: "Too Many Requests" })).toBe(
      true,
    );
    expect(isRateLimitError({ status: 429 })).toBe(true);
  });

  it("recognises the SDK's error codes", () => {
    for (const code of [
      "over_email_send_rate_limit",
      "over_request_rate_limit",
      "over_sms_send_rate_limit",
    ]) {
      // Status deliberately absent: older SDKs carry the code alone.
      expect(isRateLimitError({ code, message: "nope" })).toBe(true);
    }
  });

  it("recognises the per-address wording", () => {
    expect(isRateLimitError({ message: PER_ADDRESS })).toBe(true);
  });

  it("is not fooled by an ordinary failure", () => {
    expect(isRateLimitError({ message: "Invalid login credentials" })).toBe(
      false,
    );
    expect(
      isRateLimitError({ status: 400, message: "User already registered" }),
    ).toBe(false);
    expect(isRateLimitError(null)).toBe(false);
    expect(isRateLimitError(undefined)).toBe(false);
    expect(isRateLimitError({})).toBe(false);
  });
});

describe("isEmailQuotaError", () => {
  /*
    The distinction /forgot-password rests on. The quota is a fact about the
    deployment and is the same answer for an address with no account behind it;
    the per-address limit can only be reached by an address mail was sent to, so
    surfacing it would say that an account exists.
  */
  it("matches the deployment-wide quota", () => {
    expect(isEmailQuotaError({ message: EMAIL_QUOTA })).toBe(true);
    expect(isEmailQuotaError({ message: "Email rate limit exceeded" })).toBe(
      true,
    );
  });

  it("does NOT match the per-address limit", () => {
    expect(isEmailQuotaError({ message: PER_ADDRESS })).toBe(false);
  });

  it("errs towards false, which is the safe direction", () => {
    // A quota error carrying only the code is swallowed into the neutral
    // panel. Being wrong that way costs a confusing wait; the other way is an
    // enumeration oracle.
    expect(isEmailQuotaError({ code: "over_email_send_rate_limit" })).toBe(
      false,
    );
    expect(isEmailQuotaError({ status: 429 })).toBe(false);
    expect(isEmailQuotaError(null)).toBe(false);
  });
});

describe("retryAfterSeconds", () => {
  it("reads the figure out of the message, where Supabase puts it", () => {
    expect(retryAfterSeconds({ message: PER_ADDRESS })).toBe(47);
    expect(
      retryAfterSeconds({ message: "you can only request this after 1 second" }),
    ).toBe(1);
  });

  it("converts minutes", () => {
    expect(retryAfterSeconds({ message: "try again after 2 minutes" })).toBe(
      120,
    );
  });

  it("is null when nothing was said", () => {
    expect(retryAfterSeconds({ message: EMAIL_QUOTA })).toBeNull();
    expect(retryAfterSeconds({ status: 429 })).toBeNull();
    expect(retryAfterSeconds(null)).toBeNull();
  });
});

describe("describeAuthError", () => {
  it("never returns the provider's own wording", () => {
    /*
      The whole point of the module. "email rate limit exceeded" reached
      residents as a red popup naming an internal quota, at the moment they
      were trying to join their village.
    */
    const leaky = [
      EMAIL_QUOTA,
      PER_ADDRESS,
      "Invalid login credentials",
      "Database error saving new user",
      "AuthApiError: unexpected_failure",
    ];

    for (const message of leaky) {
      for (const flow of FLOWS) {
        const { message: shown } = describeAuthError({ message }, flow);
        expect(shown).not.toContain(message);
        expect(shown.length).toBeGreaterThan(0);
      }
    }
  });

  it("marks a rate limit and carries a wait for it", () => {
    const quota = describeAuthError({ message: EMAIL_QUOTA }, "signup");
    expect(quota.rateLimited).toBe(true);
    // Nothing in the message said how long, so the fallback stands in.
    expect(quota.retryAfter).toBe(AUTH_RETRY_FALLBACK_SECONDS);

    const perAddress = describeAuthError({ message: PER_ADDRESS }, "signup");
    expect(perAddress.rateLimited).toBe(true);
    expect(perAddress.retryAfter).toBe(47);
  });

  it("holds the button for nothing else", () => {
    // A cooldown on a mistyped password would be a form punishing a typo.
    const ordinary = describeAuthError(
      { status: 400, message: "Invalid login credentials" },
      "signin",
    );
    expect(ordinary.rateLimited).toBe(false);
    expect(ordinary.retryAfter).toBeNull();
  });

  it("says something for every flow, rate limited or not", () => {
    for (const flow of FLOWS) {
      expect(rateLimitMessage(flow)).toMatch(/try again/i);
      expect(authErrorMessage({ message: "boom" }, flow).length).toBeGreaterThan(
        0,
      );
    }
  });

  it("uses the provider's figure in the sentence when it has one", () => {
    expect(rateLimitMessage("signup", 45)).toContain("45 seconds");
    expect(rateLimitMessage("signup", 60)).toContain("1 minute");
    expect(rateLimitMessage("signup", 120)).toContain("2 minutes");
    expect(rateLimitMessage("signup", null)).toContain("a few minutes");
  });
});

describe("requestErrorMessage", () => {
  it("tells the form's own timeout apart from a network failure", () => {
    // The forms abort at AUTH_REQUEST_TIMEOUT_MS. "Check your connection" is
    // unhelpful to somebody whose connection is fine and simply slow.
    const timedOut = requestErrorMessage(
      new DOMException("Request timed out", "TimeoutError"),
    );
    expect(timedOut).toMatch(/too long/i);

    expect(requestErrorMessage(new TypeError("Failed to fetch"))).toMatch(
      /network/i,
    );
    expect(requestErrorMessage(undefined)).toMatch(/network/i);
  });
});
