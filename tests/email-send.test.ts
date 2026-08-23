import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The transport, and the one property that matters more than delivery:
 * **nothing it does can fail a resident's registration.**
 *
 * `sendEmail` is awaited inside both registration routes, after the auth user
 * and the profile row exist. A throw there would tell somebody their sign-up
 * failed when it succeeded, with no way for them to tell the difference and no
 * safe retry — so every failure mode Resend has is asserted here to resolve to
 * a value instead: no key, a refused message, a thrown network error, a blank
 * address, and a provider that never answers.
 *
 * The SDK is mocked at its module boundary, which is the same line every other
 * test in this suite draws. Nothing here needs a key, and a test that wanted a
 * real send would be a test CI could not run.
 *
 * `API_KEY` is read at module load, so each case re-imports with the
 * environment it wants — the pattern `auth.test.ts` uses for `ADMIN_EMAILS`.
 */

const mocks = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

/** Imports `send.ts` fresh, with or without a key configured. */
async function load(apiKey?: string) {
  vi.resetModules();

  if (apiKey === undefined) {
    vi.stubEnv("RESEND_API_KEY", "");
  } else {
    vi.stubEnv("RESEND_API_KEY", apiKey);
  }

  return import("@/lib/email/send");
}

const message = {
  subject: "Welcome to Little Barford on VillageWatch",
  text: "Hello Sam,\n\nYou have joined Little Barford.",
};

beforeEach(() => {
  mocks.send.mockReset();
  mocks.send.mockResolvedValue({ data: { id: "email-1" }, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sendEmail", () => {
  it("logs instead of sending when RESEND_API_KEY is unset", async () => {
    const { sendEmail, isEmailConfigured } = await load();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await sendEmail({ to: "sam@example.test", message });

    expect(isEmailConfigured).toBe(false);
    expect(result).toEqual({ sent: false, skipped: "not_configured" });
    expect(mocks.send).not.toHaveBeenCalled();

    // The text part is what is logged — it is the message, and a table layout
    // in a terminal is noise.
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it("sends the rendered message when a key is configured", async () => {
    const { sendEmail, isEmailConfigured } = await load("re_test_key");

    const result = await sendEmail({ to: "sam@example.test", message });

    expect(isEmailConfigured).toBe(true);
    expect(result).toEqual({ sent: true, id: "email-1" });

    const payload = mocks.send.mock.calls[0]?.[0];
    expect(payload.to).toBe("sam@example.test");
    expect(payload.subject).toBe(message.subject);
    expect(payload.text).toBe(message.text);
  });

  it("omits `html` entirely for a text-only message", async () => {
    const { sendEmail } = await load("re_test_key");

    await sendEmail({ to: "sam@example.test", message });

    // Not `html: undefined`. Resend requires at least one of html/text/react
    // and rejects an explicit undefined alongside text, which is the shape a
    // spread of an optional field produces if it is not guarded.
    expect("html" in (mocks.send.mock.calls[0]?.[0] ?? {})).toBe(false);
  });

  it("passes `html` through when the template rendered one", async () => {
    const { sendEmail } = await load("re_test_key");

    await sendEmail({
      to: "sam@example.test",
      message: { ...message, html: "<p>Hello</p>" },
    });

    expect(mocks.send.mock.calls[0]?.[0].html).toBe("<p>Hello</p>");
  });

  it("falls back to a sender on the canonical host", async () => {
    const { sendEmail } = await load("re_test_key");

    await sendEmail({ to: "sam@example.test", message });

    expect(mocks.send.mock.calls[0]?.[0].from).toBe(
      "VillageWatch <noreply@villagewatch.app>",
    );
  });

  it("uses RESEND_FROM_EMAIL where it is set", async () => {
    vi.stubEnv("RESEND_FROM_EMAIL", "Histon Watch <watch@histon.test>");
    const { sendEmail } = await load("re_test_key");

    await sendEmail({ to: "sam@example.test", message });

    expect(mocks.send.mock.calls[0]?.[0].from).toBe(
      "Histon Watch <watch@histon.test>",
    );
  });

  it("does not send to a blank address", async () => {
    const { sendEmail } = await load("re_test_key");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await sendEmail({ to: "   ", message });

    expect(result).toEqual({ sent: false, skipped: "no_recipient" });
    expect(mocks.send).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("returns a value rather than throwing when Resend refuses the message", async () => {
    const { sendEmail } = await load("re_test_key");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    mocks.send.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Domain is not verified" },
    });

    const result = await sendEmail({ to: "sam@example.test", message });

    expect(result.sent).toBe(false);
    expect(result.skipped).toBe("failed");
    // The provider's wording goes to the log and no further — same rule
    // `auth-errors.ts` applies to Supabase's.
    expect(result.error).toBe("Domain is not verified");
    error.mockRestore();
  });

  it("returns a value rather than throwing when the request itself fails", async () => {
    const { sendEmail } = await load("re_test_key");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    mocks.send.mockRejectedValue(new Error("getaddrinfo ENOTFOUND"));

    await expect(
      sendEmail({ to: "sam@example.test", message }),
    ).resolves.toEqual({
      sent: false,
      skipped: "failed",
      error: "getaddrinfo ENOTFOUND",
    });

    error.mockRestore();
  });

  it("gives up rather than hanging when Resend never answers", async () => {
    vi.useFakeTimers();
    const { sendEmail } = await load("re_test_key");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    mocks.send.mockReturnValue(new Promise(() => {}));

    const pending = sendEmail({ to: "sam@example.test", message });
    await vi.advanceTimersByTimeAsync(6_000);

    expect(await pending).toEqual({ sent: false, skipped: "timeout" });

    warn.mockRestore();
    vi.useRealTimers();
  });
});

describe("sendWelcomeEmail", () => {
  it("renders the welcome and sends it to the new resident", async () => {
    const { sendWelcomeEmail } = await load("re_test_key");

    const result = await sendWelcomeEmail({
      to: "sam@example.test",
      fullName: "Sam Okonkwo",
      villageName: "Little Barford",
    });

    expect(result.sent).toBe(true);

    const payload = mocks.send.mock.calls[0]?.[0];
    expect(payload.to).toBe("sam@example.test");
    expect(payload.subject).toContain("Little Barford");
    // The first name, which is what the greeting uses.
    expect(payload.text).toContain("Sam");
  });
});
