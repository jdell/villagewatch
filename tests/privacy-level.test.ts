import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRIVACY_LEVEL,
  PRIVACY_LEVELS,
  PRIVACY_LEVEL_META,
  PRIVACY_LEVEL_VALUES,
  resolvePrivacyLevel,
} from "@/lib/constants";
import { villagePrivacyLevelFormSchema } from "@/lib/validations";

/**
 * The per-village face redaction level.
 *
 * `Village.privacyLevel` is a `String` column with no CHECK constraint, so the
 * database will hold whatever a `psql` session puts in it — and whatever comes
 * back out is turned into a redaction mode in the reporter's browser, where
 * there is no server behind it to catch a mistake. Everything below is about
 * that one join: the write is narrow, the read never widens, and no path
 * through either produces a level that covers a face less than the scale's
 * weakest.
 *
 * What cannot be asserted here is the redaction itself. It is `ctx.filter` and
 * `drawImage` on a canvas MediaPipe fed, so it needs a browser; the suite is
 * node-only by design (see The test suite in CLAUDE.md). What *is* assertable
 * is the contract the browser code is handed, which is this module.
 */

describe("PRIVACY_LEVELS", () => {
  it("offers exactly the four levels, weakest to strongest", () => {
    expect(PRIVACY_LEVEL_VALUES).toEqual([
      "light",
      "standard",
      "heavy",
      "redact",
    ]);
  });

  it("maps each level to the mode and radius the uploader applies", () => {
    expect(PRIVACY_LEVEL_META.light).toMatchObject({ mode: "blur", radius: 15 });
    expect(PRIVACY_LEVEL_META.standard).toMatchObject({
      mode: "blur",
      radius: 22,
    });
    expect(PRIVACY_LEVEL_META.heavy).toMatchObject({ mode: "blur", radius: 35 });
    expect(PRIVACY_LEVEL_META.redact).toMatchObject({
      mode: "redact",
      radius: 0,
    });
  });

  it("recommends standard, and standard is the default", () => {
    // The label a coordinator reads and the value a village gets with nobody
    // touching the screen have to be the same one, or the recommendation is
    // advice the product does not take itself.
    expect(DEFAULT_PRIVACY_LEVEL).toBe("standard");
    expect(PRIVACY_LEVEL_META[DEFAULT_PRIVACY_LEVEL].label).toContain(
      "recommended",
    );
  });

  it("has no level that leaves a face uncovered", () => {
    // The scale is a presentation choice. There is no "off" on it, and a radius
    // of zero is only legal where the mode reads no source pixels at all.
    for (const level of PRIVACY_LEVELS) {
      expect(["blur", "redact"]).toContain(level.mode);
      if (level.mode === "blur") expect(level.radius).toBeGreaterThan(0);
      else expect(level.radius).toBe(0);
    }
  });

  it("gives every level a label and a line of its own", () => {
    const details = new Set(PRIVACY_LEVELS.map((level) => level.detail));
    expect(details.size).toBe(PRIVACY_LEVELS.length);

    for (const level of PRIVACY_LEVELS) {
      expect(level.label.length).toBeGreaterThan(0);
      expect(level.detail.length).toBeGreaterThan(0);
    }
  });
});

describe("resolvePrivacyLevel", () => {
  it("returns a level that was actually stored", () => {
    for (const value of PRIVACY_LEVEL_VALUES) {
      expect(resolvePrivacyLevel(value)).toBe(value);
    }
  });

  it("falls back to standard for an empty column", () => {
    // Three shapes of nothing: a null column, a village row that did not
    // resolve, and a build reading a database written before the migration.
    expect(resolvePrivacyLevel(null)).toBe("standard");
    expect(resolvePrivacyLevel(undefined)).toBe("standard");
    expect(resolvePrivacyLevel("")).toBe("standard");
  });

  it("falls back rather than throwing on a value it does not know", () => {
    // A level a later release removes leaves rows behind naming it, and there
    // is no CHECK constraint stopping somebody typing one in by hand. Either
    // way the answer has to be a level: this ends up as a redaction mode in a
    // reporter's browser, and an exception there is a wizard that cannot
    // attach a photo.
    expect(resolvePrivacyLevel("none")).toBe("standard");
    expect(resolvePrivacyLevel("off")).toBe("standard");
    expect(resolvePrivacyLevel("STANDARD")).toBe("standard");
    expect(resolvePrivacyLevel(" standard ")).toBe("standard");
  });

  it("does not mistake an Object.prototype key for a level", () => {
    // `PRIVACY_LEVEL_META` is a plain object, so `"toString" in meta` is true.
    // The column is free text, so that string can genuinely arrive — and the
    // lookup behind an `in` check would hand a function to the uploader where
    // a level was expected.
    for (const key of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      const resolved = resolvePrivacyLevel(key);
      expect(resolved).toBe("standard");
      expect(typeof PRIVACY_LEVEL_META[resolved]).toBe("object");
    }
  });
});

describe("villagePrivacyLevelFormSchema", () => {
  it("accepts each of the four levels", () => {
    for (const privacyLevel of PRIVACY_LEVEL_VALUES) {
      const parsed = villagePrivacyLevelFormSchema.safeParse({ privacyLevel });
      expect(parsed.success).toBe(true);
      if (parsed.success) expect(parsed.data.privacyLevel).toBe(privacyLevel);
    }
  });

  it("rejects anything else, including a missing field", () => {
    // This is the only place in the application that writes the column, so the
    // enum here is what stands in for the CHECK constraint the migration
    // deliberately does not create.
    for (const privacyLevel of ["", "none", "off", "Standard", 22, null]) {
      expect(
        villagePrivacyLevelFormSchema.safeParse({ privacyLevel }).success,
      ).toBe(false);
    }

    expect(villagePrivacyLevelFormSchema.safeParse({}).success).toBe(false);
  });

  it("has no villageId in the payload", () => {
    // Domain rule 4. A village id here would be a way to turn down the
    // redaction on a neighbouring parish's uploads; the action takes it from
    // the session profile instead.
    const parsed = villagePrivacyLevelFormSchema.safeParse({
      privacyLevel: "heavy",
      villageId: "00000000-0000-0000-0000-000000000000",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).not.toHaveProperty("villageId");
  });
});
