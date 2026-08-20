import { describe, expect, it } from "vitest";
import {
  DEFAULT_VILLAGE_MODE,
  VILLAGE_MODES,
  VILLAGE_MODE_META,
  documentsForMode,
  resolveVillageMode,
} from "@/lib/constants";
import { villageModeFormSchema } from "@/lib/validations";

/**
 * `Village.mode` is a free-text column with no CHECK constraint, and what it
 * decides is which legal documents a village has to accept before a resident
 * can file a report. So the properties worth pinning are the ones that hold when
 * the column contains something nobody expected:
 *
 *   * an unrecognised value narrows to `community` rather than throwing — this
 *     is read on the path a report is filed through, and an exception there is
 *     an error page in front of somebody reporting a crime;
 *   * `Object.hasOwn`, not `in`, so a column holding `toString` or `constructor`
 *     does not resolve to a function where a mode was expected. Same trap as
 *     `resolvePrivacyLevel`, same reason: this reads a `String` column;
 *   * the two document sets do not overlap. A community village is never asked
 *     for a cut-down council pack, and a council village is never asked to
 *     accept an agreement naming a private individual as controller;
 *   * the write schema is a closed enum, because it is the only thing in the
 *     application that puts a value in the column.
 *
 * Pure — no mocks, no environment, nothing to stub.
 */

describe("resolveVillageMode", () => {
  it("passes through the modes this build knows about", () => {
    for (const mode of VILLAGE_MODES) {
      expect(resolveVillageMode(mode.value)).toBe(mode.value);
    }
  });

  it("falls back to the community model rather than throwing", () => {
    // The direction of the fallback matters as much as its existence: it asks
    // for a document a village can actually produce rather than three it cannot.
    expect(DEFAULT_VILLAGE_MODE).toBe("community");

    for (const value of ["parish", "COUNCIL", "", " council", "0"]) {
      expect(resolveVillageMode(value)).toBe("community");
    }
  });

  it("treats null and undefined as the default", () => {
    expect(resolveVillageMode(null)).toBe("community");
    expect(resolveVillageMode(undefined)).toBe("community");
  });

  it("does not resolve a prototype key to a mode", () => {
    // `in` would answer true for all of these on a plain object, and the lookup
    // that followed would hand a function to the gate. This reads a free-text
    // column, which is exactly where one of them could arrive.
    for (const key of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
      expect(resolveVillageMode(key)).toBe("community");
    }
  });
});

describe("documentsForMode", () => {
  it("asks a community village for its one agreement", () => {
    expect(documentsForMode("community")).toEqual(["community"]);
  });

  it("asks a council for the three it separately holds, in reading order", () => {
    // The assessment first, because it explains what the processing is; then
    // the policy document that authorises the criminal offence data in it; then
    // the contract. The compliance screen renders them in this order.
    expect(documentsForMode("council")).toEqual(["dpia", "apd", "dpa"]);
  });

  it("gives the two models no document in common", () => {
    const community = new Set(documentsForMode("community"));
    const shared = documentsForMode("council").filter((id) =>
      community.has(id),
    );

    expect(shared).toEqual([]);
  });

  it("names a mode for every value in the metadata, and vice versa", () => {
    // A mode added to `VILLAGE_MODES` with no branch here would silently get
    // the council's three, which is the wrong way round for a new lightweight
    // model.
    for (const mode of VILLAGE_MODES) {
      expect(documentsForMode(mode.value).length).toBeGreaterThan(0);
      expect(VILLAGE_MODE_META[mode.value]).toBe(mode);
    }
  });
});

describe("villageModeFormSchema", () => {
  it("accepts both modes", () => {
    // `community` parses even though `setVillageMode` refuses it: refusing it
    // there is what lets the refusal carry a sentence about why a village
    // cannot move back, instead of "that submission is not valid".
    expect(villageModeFormSchema.parse({ mode: "council" }).mode).toBe(
      "council",
    );
    expect(villageModeFormSchema.parse({ mode: "community" }).mode).toBe(
      "community",
    );
  });

  it("refuses anything else", () => {
    for (const mode of ["", "parish", "COUNCIL", "toString"]) {
      expect(villageModeFormSchema.safeParse({ mode }).success).toBe(false);
    }
  });
});
