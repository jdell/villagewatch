import { describe, expect, it } from "vitest";
import { maskEmail } from "@/lib/format";

/**
 * The mask in front of every email address on the resident list.
 *
 * It has a test file of its own because the failure that matters is silent and
 * points the wrong way: a masker that fails *open* — echoing back anything it
 * could not parse — puts a full address on screen precisely when something
 * unexpected is in the column, which is the one case nobody is watching for.
 * Every branch below therefore asserts the bare mask rather than the input.
 *
 * What is deliberately not asserted is that this is an access control. It is
 * not: the reveal is a server action and the coordinator is entitled to the
 * address. This reduces incidental exposure — a screen-share at a parish
 * meeting, a screenshot — and the tests say only what the function does.
 */

describe("the ordinary case", () => {
  it("keeps the first character and the whole domain", () => {
    expect(maskEmail("jane@gmail.com")).toBe("j***@gmail.com");
  });

  it("hides the length of the local part", () => {
    // The point of a fixed-width mask. In a village of a few hundred people,
    // "starts with j and is nineteen characters long" narrows it a long way.
    expect(maskEmail("jane.elizabeth.smith@gmail.com")).toBe("j***@gmail.com");
    expect(maskEmail("jo@gmail.com")).toBe("j***@gmail.com");
  });

  it("keeps a subdomain and a country suffix whole", () => {
    expect(maskEmail("clerk@histon-impington.parish.gov.uk")).toBe(
      "c***@histon-impington.parish.gov.uk",
    );
  });

  it("trims surrounding whitespace before masking", () => {
    expect(maskEmail("  jane@gmail.com  ")).toBe("j***@gmail.com");
  });
});

describe("addresses that are not the ordinary case", () => {
  it("splits on the last @, not the first", () => {
    // A quoted local part may legally contain one. Splitting on the first would
    // treat `b"@example.test` as the domain and print `a@` of the local part —
    // more than the mask is meant to leave.
    expect(maskEmail('"a@b"@example.test')).toBe('"***@example.test');
  });

  it("returns the first code point of an astral local part, not half of one", () => {
    // `[0]` on a surrogate pair gives a lone surrogate, which renders as a
    // replacement glyph — unhelpful, and not what the mask promises.
    const masked = maskEmail("𝒥ane@gmail.com");
    expect(masked).toBe("𝒥***@gmail.com");
    expect(masked).not.toContain("�");
  });

  it("masks a single-character local part like any other", () => {
    // Nothing is hidden here, because there was nothing to hide. It still gets
    // the fixed mask, so the column does not advertise which rows are short.
    expect(maskEmail("j@gmail.com")).toBe("j***@gmail.com");
  });

  it("keeps a plus-addressed local part behind the mask", () => {
    expect(maskEmail("jane+villagewatch@gmail.com")).toBe("j***@gmail.com");
  });
});

describe("what it refuses to echo", () => {
  it.each([
    ["no @ at all", "not-an-email"],
    ["nothing before the @", "@gmail.com"],
    ["nothing after the @", "jane@"],
    ["a bare @", "@"],
    ["an empty string", ""],
    ["whitespace only", "   "],
  ])("returns the bare mask for %s", (_label, input) => {
    expect(maskEmail(input)).toBe("***");
  });

  it.each([null, undefined])("returns the bare mask for %s", (input) => {
    expect(maskEmail(input)).toBe("***");
  });

  it("never returns the input it could not parse", () => {
    // The whole point of failing closed. A value that reached here without an
    // `@` is already surprising; echoing it on the grounds that it did not look
    // like an address is how an unmasked one ends up on screen.
    expect(maskEmail("jane.gmail.com")).not.toContain("jane");
  });
});
