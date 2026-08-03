import { describe, expect, it } from "vitest";
import {
  buildIncidentReference,
  formatIncidentReference,
  villageReferenceCode,
} from "@/lib/incident-reference";

/**
 * The per-village incident reference.
 *
 * `VW-HIS-2026-0003` is read aloud on the phone to a PCSO, typed into a police
 * system and printed at the top of a community safety report, so three
 * properties are worth pinning down.
 *
 * **The shape does not vary.** A reference with three digits in it, or with an
 * empty code where a village name had no letters in it, is a reference somebody
 * mistypes into a system that then has no record of the report.
 *
 * **The derivation matches the backfill migration.** The stored string and the
 * one the application would rebuild from the two columns have to agree, and the
 * migration writes the same rule a second time in SQL — the ASCII-letter class
 * and the `VIL` fallback are asserted here because that is the only place the
 * two copies can be compared without a database.
 *
 * **A row with no number of its own keeps the reference it has.** Every report
 * filed before this scheme existed is in that state, and a formatter that
 * returned `VW-HIS-undefined-NaN` for one would put it on a police summary.
 */

const HISTON = { name: "Histon", villageCode: null };

describe("villageReferenceCode", () => {
  it("takes the first three letters of the name, uppercased", () => {
    expect(villageReferenceCode(HISTON)).toBe("HIS");
  });

  it("skips spaces and punctuation rather than counting them as letters", () => {
    // "ST " would be two letters and a space in a reference.
    expect(villageReferenceCode({ name: "St Neots" })).toBe("STN");
    expect(villageReferenceCode({ name: "A' Chrìon Làraich" })).toBe("ACH");
    expect(villageReferenceCode({ name: "Weston-super-Mare" })).toBe("WES");
  });

  it("takes what there is when the name is shorter than the code", () => {
    expect(villageReferenceCode({ name: "Ay" })).toBe("AY");
  });

  it("falls back rather than producing an empty code", () => {
    // `VW--2026-0001` reads as a bug in the reference rather than a gap in the
    // village record, which is the whole reason there is a fallback.
    expect(villageReferenceCode({ name: "1066" })).toBe("VIL");
    expect(villageReferenceCode({ name: "" })).toBe("VIL");
    expect(villageReferenceCode({ name: null })).toBe("VIL");
  });

  it("prefers the hand-set code, uppercased and trimmed", () => {
    // The answer to two villages both deriving GRE. It is set by hand in the
    // database, so it arrives unnormalised.
    expect(villageReferenceCode({ name: "Great Barton", villageCode: "grb" })).toBe(
      "GRB",
    );
    expect(villageReferenceCode({ name: "Great Barton", villageCode: " GRB " })).toBe(
      "GRB",
    );
  });

  it("derives from the name when the hand-set code is blank", () => {
    // An empty string in the column is what a form that saved a cleared field
    // would leave, and it must not become the code.
    expect(villageReferenceCode({ name: "Histon", villageCode: "" })).toBe("HIS");
    expect(villageReferenceCode({ name: "Histon", villageCode: "   " })).toBe("HIS");
  });

  it("does not separate two villages that derive the same letters", () => {
    // Asserted rather than merely documented: it is why `reference` is not
    // globally unique, and a change that made this pass by accident would
    // reintroduce the constraint that could stop a village filing at all.
    expect(villageReferenceCode({ name: "Great Ashfield" })).toBe(
      villageReferenceCode({ name: "Great Barton" }),
    );
  });
});

describe("buildIncidentReference", () => {
  it("is prefix, code, year and a four-digit number", () => {
    expect(
      buildIncidentReference({ villageCode: "HIS", year: 2026, number: 3 }),
    ).toBe("VW-HIS-2026-0003");
  });

  it("pads to four digits and never truncates past them", () => {
    expect(
      buildIncidentReference({ villageCode: "HIS", year: 2026, number: 1 }),
    ).toBe("VW-HIS-2026-0001");
    expect(
      buildIncidentReference({ villageCode: "HIS", year: 2026, number: 9999 }),
    ).toBe("VW-HIS-2026-9999");
    // A village filing its ten-thousandth report of the year gets a longer
    // reference, not a wrapped one — 0000 would repeat 9999's neighbourhood and
    // the number is the record.
    expect(
      buildIncidentReference({ villageCode: "HIS", year: 2026, number: 10_000 }),
    ).toBe("VW-HIS-2026-10000");
  });
});

describe("formatIncidentReference", () => {
  const incident = {
    reference: "VW-HIS-2026-0003",
    referenceYear: 2026,
    villageIncidentNumber: 3,
  };

  it("builds the reference from the village and the two columns", () => {
    expect(formatIncidentReference(HISTON, incident)).toBe("VW-HIS-2026-0003");
  });

  it("numbers each village from one, whatever the rest of the deployment did", () => {
    // The property the whole change exists for: the third report in Histon is
    // 0003 in Histon, not the platform's 184th.
    expect(
      formatIncidentReference(HISTON, {
        referenceYear: 2026,
        villageIncidentNumber: 3,
      }),
    ).toBe("VW-HIS-2026-0003");
    expect(
      formatIncidentReference(
        { name: "Bourn" },
        { referenceYear: 2026, villageIncidentNumber: 1 },
      ),
    ).toBe("VW-BOU-2026-0001");
  });

  it("keeps the stored reference for a row with no number of its own", () => {
    // Every report filed before the per-village scheme existed.
    expect(
      formatIncidentReference(HISTON, {
        reference: "VW-2026-0184",
        referenceYear: null,
        villageIncidentNumber: null,
      }),
    ).toBe("VW-2026-0184");
  });

  it("keeps the stored reference when only one of the two columns is set", () => {
    // Half a pair is a row somebody edited by hand; the string it already has
    // is the better answer than one built round a missing half.
    expect(
      formatIncidentReference(HISTON, {
        reference: "VW-2026-0184",
        referenceYear: 2026,
        villageIncidentNumber: null,
      }),
    ).toBe("VW-2026-0184");
    expect(
      formatIncidentReference(HISTON, {
        reference: "VW-2026-0184",
        villageIncidentNumber: 3,
      }),
    ).toBe("VW-2026-0184");
  });

  it("keeps the stored reference when the village is not to hand", () => {
    expect(formatIncidentReference(null, incident)).toBe("VW-HIS-2026-0003");
    expect(formatIncidentReference(undefined, incident)).toBe("VW-HIS-2026-0003");
  });

  it("returns an empty string rather than a half-built one", () => {
    // A caller with neither a village nor a stored reference has nothing to
    // render; `VW-undefined-…` on a police summary is the failure this avoids.
    expect(formatIncidentReference(null, {})).toBe("");
  });

  it("accepts zero as a number, because a sequence that starts at one has none", () => {
    // Guards the `typeof … === "number"` check against being written as a
    // truthiness test, which would send a legitimate row down the fallback.
    expect(
      formatIncidentReference(HISTON, {
        reference: "VW-2026-0184",
        referenceYear: 2026,
        villageIncidentNumber: 0,
      }),
    ).toBe("VW-HIS-2026-0000");
  });
});
