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

const mocks = vi.hoisted(() => ({ send: vi.fn(), batchSend: vi.fn() }));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
    batch = { send: mocks.batchSend };
  },
}));

/** What Resend answers a batch of `n` with when it accepts all of them. */
function batchAccepted(n: number) {
  return {
    data: {
      data: Array.from({ length: n }, (_, i) => ({ id: `email-${i}` })),
      errors: [],
    },
    error: null,
  };
}

/** One rendered message per address, which is the only shape the API takes. */
function recipients(addresses: readonly string[]) {
  return addresses.map((to) => ({ to, message }));
}

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
  mocks.batchSend.mockReset();
  mocks.batchSend.mockImplementation(async (payload: unknown[]) =>
    batchAccepted(payload.length),
  );
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

/**
 * The fan-out, and the property that matters more than delivery: **one message
 * per resident, never one message addressed to the village.**
 *
 * `to` accepts a list, and a village-wide alert is exactly the shape that
 * tempts somebody to pass one — at which point every address is rendered into
 * the `To:` header of the message every other resident receives. That is a
 * neighbourhood watch scheme's membership list disclosed to everybody on it,
 * forwarded and unrecallable, and it says who reports on their neighbours. It
 * is asserted here rather than trusted to the type, because the type is one
 * refactor from being widened by somebody who has not read this.
 *
 * Everything else is `sendEmail`'s contract: nothing throws, and a failure is a
 * value the caller can ignore.
 */
describe("sendBulkEmail", () => {
  it("addresses one message to each recipient and never one to all of them", async () => {
    const { sendBulkEmail } = await load("re_test_key");

    const result = await sendBulkEmail(
      recipients(["a@example.test", "b@example.test", "c@example.test"]),
    );

    expect(result.matched).toBe(3);
    expect(result.sent).toBe(3);

    // One call, three separate messages in it — not three addresses on one.
    expect(mocks.batchSend).toHaveBeenCalledTimes(1);

    const payload = mocks.batchSend.mock.calls[0]?.[0] as { to: unknown }[];
    expect(payload).toHaveLength(3);
    expect(payload.map((entry) => entry.to)).toEqual([
      "a@example.test",
      "b@example.test",
      "c@example.test",
    ]);
    // The load-bearing assertion: every `to` is one address, not a list.
    for (const entry of payload) {
      expect(typeof entry.to).toBe("string");
    }
  });

  it("splits an audience into batches of EMAIL_BATCH_SIZE", async () => {
    const { sendBulkEmail } = await load("re_test_key");
    const { EMAIL_BATCH_SIZE } = await import("@/lib/constants");

    const addresses = Array.from(
      { length: EMAIL_BATCH_SIZE + 1 },
      (_, i) => `resident-${i}@example.test`,
    );

    const result = await sendBulkEmail(recipients(addresses));

    expect(mocks.batchSend).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(EMAIL_BATCH_SIZE + 1);
  });

  it("caps the audience at MAX_EMAIL_RECIPIENTS and says so", async () => {
    const { sendBulkEmail } = await load("re_test_key");
    const { MAX_EMAIL_RECIPIENTS } = await import("@/lib/constants");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const addresses = Array.from(
      { length: MAX_EMAIL_RECIPIENTS + 5 },
      (_, i) => `resident-${i}@example.test`,
    );

    const result = await sendBulkEmail(recipients(addresses));

    // `matched` reports the audience that was selected, `sent` what went — so a
    // truncation is visible in the figures rather than only in the log.
    expect(result.matched).toBe(MAX_EMAIL_RECIPIENTS + 5);
    expect(result.sent).toBe(MAX_EMAIL_RECIPIENTS);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });

  it("logs instead of sending when RESEND_API_KEY is unset", async () => {
    const { sendBulkEmail } = await load();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await sendBulkEmail(recipients(["a@example.test"]));

    expect(result).toMatchObject({ sent: 0, skipped: "not_configured" });
    expect(mocks.batchSend).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalled();

    log.mockRestore();
  });

  it("drops blank addresses rather than sending to nobody", async () => {
    const { sendBulkEmail } = await load("re_test_key");

    const result = await sendBulkEmail(recipients(["", "   "]));

    expect(result).toMatchObject({ matched: 0, sent: 0, skipped: "no_recipients" });
    expect(mocks.batchSend).not.toHaveBeenCalled();
  });

  it("resolves to a value when Resend refuses the batch", async () => {
    const { sendBulkEmail } = await load("re_test_key");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    mocks.batchSend.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Domain is not verified" },
    });

    const result = await sendBulkEmail(recipients(["a@example.test"]));

    expect(result).toMatchObject({ sent: 0, skipped: "failed" });
    expect(result.error).toContain("not verified");

    error.mockRestore();
  });

  it("resolves to a value when the SDK throws", async () => {
    const { sendBulkEmail } = await load("re_test_key");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    mocks.batchSend.mockRejectedValue(new Error("socket hang up"));

    const result = await sendBulkEmail(recipients(["a@example.test"]));

    expect(result).toMatchObject({ sent: 0, skipped: "failed" });

    error.mockRestore();
  });

  it("keeps the batches after one that failed", async () => {
    const { sendBulkEmail } = await load("re_test_key");
    const { EMAIL_BATCH_SIZE } = await import("@/lib/constants");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    // A partial delivery is worth more than none: one bad chunk must not
    // abandon the residents in the chunks after it.
    mocks.batchSend
      .mockResolvedValueOnce({
        data: null,
        error: { name: "application_error", message: "upstream" },
      })
      .mockImplementationOnce(async (payload: unknown[]) =>
        batchAccepted(payload.length),
      );

    const addresses = Array.from(
      { length: EMAIL_BATCH_SIZE + 3 },
      (_, i) => `resident-${i}@example.test`,
    );

    const result = await sendBulkEmail(recipients(addresses));

    expect(mocks.batchSend).toHaveBeenCalledTimes(2);
    expect(result.sent).toBe(3);
    expect(result.skipped).toBeUndefined();

    error.mockRestore();
  });

  it("counts the messages a permissive batch rejected as unsent", async () => {
    const { sendBulkEmail } = await load("re_test_key");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Permissive validation is what stops one malformed address in a village
    // costing the other ninety-nine messages in its chunk.
    mocks.batchSend.mockResolvedValue({
      data: {
        data: [{ id: "email-0" }, { id: "email-1" }],
        errors: [{ index: 2, message: "Invalid `to` field" }],
      },
      error: null,
    });

    const result = await sendBulkEmail(
      recipients(["a@example.test", "b@example.test", "not-an-address"]),
    );

    expect(result.matched).toBe(3);
    expect(result.sent).toBe(2);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});

describe("sendCoordinatorDecisionEmail", () => {
  it("carries the reviewer's note on a rejection", async () => {
    const { sendCoordinatorDecisionEmail } = await load("re_test_key");

    const result = await sendCoordinatorDecisionEmail({
      to: "sam@example.test",
      fullName: "Sam Okonkwo",
      villageName: "Little Barford",
      approved: false,
      note: "Please reapply once you have spoken to the parish clerk.",
    });

    expect(result.sent).toBe(true);

    const payload = mocks.send.mock.calls[0]?.[0];
    expect(payload.to).toBe("sam@example.test");
    // "declined" with nothing after it tells a volunteer nothing about whether
    // to try again, which is why the schema demands a note.
    expect(payload.text).toContain("parish clerk");
  });

  it("sends the approval briefing when approved", async () => {
    const { sendCoordinatorDecisionEmail } = await load("re_test_key");

    const result = await sendCoordinatorDecisionEmail({
      to: "sam@example.test",
      fullName: "Sam Okonkwo",
      villageName: "Little Barford",
      approved: true,
    });

    expect(result.sent).toBe(true);
    expect(mocks.send.mock.calls[0]?.[0].subject).toContain("coordinator");
  });
});
