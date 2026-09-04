import { describe, expect, it } from "vitest";
import {
  fieldErrors,
  incidentEditSchema,
  incidentProcessSchema,
  incidentReportSchema,
  loginSchema,
  registerSchema,
  structuredIncidentSchema,
  villageParishCouncilFormSchema,
} from "@/lib/validations";

/**
 * The Zod schemas are the last thing between a request body and a database
 * write, so what is asserted here is both halves of that job: the valid payload
 * a wizard actually posts is accepted, and each rule that exists for a *reason*
 * rejects the payload it was written for. The open-redirect rule on `next` and
 * the coordinate bounds are the two worth reading first.
 */

const HOUR_MS = 60 * 60 * 1000;

/** What the report wizard posts after a successful AI pass. */
function report(overrides: Record<string, unknown> = {}) {
  return {
    type: "BURGLARY",
    severity: "HIGH",
    title: "Shed broken into overnight",
    description: "A garden shed was forced open and tools were taken.",
    rawDescription: "Someone forced the lock on my shed last night and took the mower.",
    occurredAt: new Date(Date.now() - 6 * HOUR_MS),
    lat: 52.5,
    lng: -0.4,
    locationText: "The lane behind the village hall",
    isAnonymous: false,
    reportedToPolice: false,
    media: [],
    tags: ["shed"],
    ...overrides,
  };
}

describe("incidentReportSchema", () => {
  it("accepts what the wizard posts", () => {
    const parsed = incidentReportSchema.safeParse(report());

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.title).toBe("Shed broken into overnight");
    // Defaults fill in rather than the row arriving half-built.
    expect(parsed.data.media).toEqual([]);
    expect(parsed.data.isAnonymous).toBe(false);
  });

  it("accepts a report filed without the AI pass", () => {
    // No `rawDescription`: the reporter's own words fill both columns and the
    // substance rule falls on `description` instead.
    const parsed = incidentReportSchema.safeParse(
      report({
        rawDescription: undefined,
        description: "Someone forced the lock on my shed last night.",
      }),
    );

    expect(parsed.success).toBe(true);
  });

  it("rejects a report dated in the future", () => {
    const parsed = incidentReportSchema.safeParse(
      report({ occurredAt: new Date(Date.now() + 48 * HOUR_MS) }),
    );

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(fieldErrors(parsed.error).occurredAt).toBe("The date cannot be in the future");
  });

  it("rejects a report older than a year", () => {
    const parsed = incidentReportSchema.safeParse(
      report({ occurredAt: new Date(Date.now() - 400 * 24 * HOUR_MS) }),
    );

    expect(parsed.success).toBe(false);
  });

  it("rejects a report with nothing useful in the reporter's own words", () => {
    // The 20-character floor sits on whichever field holds what the reporter
    // wrote — here `rawDescription`, even though the rewrite is long enough.
    const parsed = incidentReportSchema.safeParse(
      report({ rawDescription: "shed gone" }),
    );

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(fieldErrors(parsed.error).description).toBe(
      "Describe what happened in at least 20 characters",
    );
  });

  it("rejects a police report with no reference", () => {
    const parsed = incidentReportSchema.safeParse(
      report({ reportedToPolice: true, policeReference: "" }),
    );

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(fieldErrors(parsed.error).policeReference).toBe(
      "Add the reference the police gave you",
    );
  });

  it("rejects an unknown incident type and an unknown severity", () => {
    expect(incidentReportSchema.safeParse(report({ type: "ALIENS" })).success).toBe(false);
    expect(incidentReportSchema.safeParse(report({ severity: "SPICY" })).success).toBe(
      false,
    );
  });

  it("rejects coordinates outside the world", () => {
    expect(incidentReportSchema.safeParse(report({ lat: 91 })).success).toBe(false);
    expect(incidentReportSchema.safeParse(report({ lng: -181 })).success).toBe(false);
  });

  it("rejects more media than a report may carry", () => {
    const attachment = {
      storagePath: "v1/u1/a.jpg",
      thumbnailPath: "v1/u1/a-thumb.jpg",
      mimeType: "image/jpeg",
      fileSize: 1_024,
      width: 800,
      height: 600,
      facesDetected: 0,
    };

    const parsed = incidentReportSchema.safeParse(
      report({ media: Array.from({ length: 7 }, () => attachment) }),
    );

    expect(parsed.success).toBe(false);
  });
});

describe("incidentProcessSchema", () => {
  it("accepts a draft on its way to Claude", () => {
    const parsed = incidentProcessSchema.safeParse({
      description: "Someone forced the lock on my shed last night and took the mower.",
      lat: 52.5,
      lng: -0.4,
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects a description too short to be worth an API call", () => {
    const parsed = incidentProcessSchema.safeParse({
      description: "shed gone",
      lat: 52.5,
      lng: -0.4,
    });

    expect(parsed.success).toBe(false);
  });

  it("requires the coordinates the pattern lookup runs against", () => {
    const parsed = incidentProcessSchema.safeParse({
      description: "Someone forced the lock on my shed last night and took the mower.",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("structuredIncidentSchema", () => {
  const record = {
    type: "BURGLARY",
    severity: "HIGH",
    title: "Shed broken into overnight",
    description: "A garden shed was forced open and tools were taken.",
    people_count: 1,
    tags: ["Shed", "Overnight"],
    occurred_at: "2026-07-27T02:00:00.000Z",
    location_name: "the lane behind the village hall",
    recurring: false,
    pattern_note: null,
    confidence: 0.8,
    severity_rationale: "Forced entry to an occupied property overnight.",
  };

  it("accepts the model's record and lowercases the tags", () => {
    const parsed = structuredIncidentSchema.safeParse(record);

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    // So the tag cloud does not fragment into "Shed" and "shed".
    expect(parsed.data.tags).toEqual(["shed", "overnight"]);
  });

  it("rejects a confidence outside 0–1 and an unusable timestamp", () => {
    expect(structuredIncidentSchema.safeParse({ ...record, confidence: 4 }).success).toBe(
      false,
    );
    expect(
      structuredIncidentSchema.safeParse({ ...record, occurred_at: "last Tuesday" })
        .success,
    ).toBe(false);
  });

  it("rejects more than five tags", () => {
    expect(
      structuredIncidentSchema.safeParse({
        ...record,
        tags: ["a1", "b2", "c3", "d4", "e5", "f6"],
      }).success,
    ).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a relative return path", () => {
    const parsed = loginSchema.safeParse({
      email: "resident@parish.example",
      password: "correct horse",
      next: "/dashboard",
    });

    expect(parsed.success).toBe(true);
  });

  it("rejects an off-origin redirect", () => {
    // `//evil.test` is protocol-relative — off-origin, and it starts with the
    // `/` a naive check accepts.
    expect(
      loginSchema.safeParse({
        email: "resident@parish.example",
        password: "correct horse",
        next: "//evil.test",
      }).success,
    ).toBe(false);

    expect(
      loginSchema.safeParse({
        email: "resident@parish.example",
        password: "correct horse",
        next: "https://evil.test/map",
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed email address", () => {
    expect(
      loginSchema.safeParse({ email: "not-an-address", password: "x" }).success,
    ).toBe(false);
  });
});

describe("registerSchema", () => {
  const registration = {
    fullName: "A Resident",
    email: "resident@parish.example",
    password: "Correct-Horse9",
    confirmPassword: "Correct-Horse9",
    villageId: "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    acceptTerms: true as const,
  };

  it("accepts a complete registration", () => {
    expect(registerSchema.safeParse(registration).success).toBe(true);
  });

  it("rejects a password that fails the composition rules", () => {
    expect(
      registerSchema.safeParse({
        ...registration,
        password: "correct-horse",
        confirmPassword: "correct-horse",
      }).success,
    ).toBe(false);

    expect(
      registerSchema.safeParse({
        ...registration,
        password: "Short9",
        confirmPassword: "Short9",
      }).success,
    ).toBe(false);
  });

  it("rejects a mismatched confirmation", () => {
    const parsed = registerSchema.safeParse({
      ...registration,
      confirmPassword: "Correct-Horse8",
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(fieldErrors(parsed.error).confirmPassword).toBe("Passwords do not match");
  });

  it("rejects terms that were not accepted", () => {
    expect(
      registerSchema.safeParse({ ...registration, acceptTerms: false }).success,
    ).toBe(false);
  });

  it("rejects half a home location", () => {
    // A stored `homeLat` with a null `homeLng` fails the distance test silently
    // on every alert, so it is caught here instead.
    const parsed = registerSchema.safeParse({ ...registration, homeLat: 52.5 });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(fieldErrors(parsed.error).homeLat).toBe(
      "Drop a pin on the map, or leave it blank",
    );
  });

  it("rejects a village that is not a uuid", () => {
    expect(
      registerSchema.safeParse({ ...registration, villageId: "barnack" }).success,
    ).toBe(false);
  });
});

describe("incidentEditSchema", () => {
  it("accepts the reporter's five-field edit", () => {
    expect(
      incidentEditSchema.safeParse({
        title: "Shed broken into overnight",
        description: "A garden shed was forced open and tools were taken.",
        type: "BURGLARY",
        severity: "HIGH",
      }).success,
    ).toBe(true);
  });

  it("rejects a title too short to read in a list", () => {
    expect(
      incidentEditSchema.safeParse({
        title: "Shed",
        description: "A garden shed was forced open and tools were taken.",
        type: "BURGLARY",
        severity: "HIGH",
      }).success,
    ).toBe(false);
  });
});

describe("villageParishCouncilFormSchema", () => {
  /** The value the column would actually receive, or undefined on a rejection. */
  function stored(input: string): string | null | undefined {
    const parsed = villageParishCouncilFormSchema.safeParse({
      parishCouncil: input,
    });

    return parsed.success ? parsed.data.parishCouncil : undefined;
  }

  it("accepts a council name and trims it", () => {
    expect(stored("  Bourn Parish Council  ")).toBe("Bourn Parish Council");
  });

  it("stores null rather than an empty string when the field is cleared", () => {
    // This is the rule with a consequence behind it. `reportController` falls
    // back to DATA_CONTROLLER on a truthiness check, so an empty string stored
    // in the column would count as "a controller is named" and print a blank
    // where a police report says who is answerable for the data.
    expect(stored("")).toBeNull();
    expect(stored("   ")).toBeNull();
  });

  it("accepts the names real councils actually have", () => {
    // No format validation on purpose — a pattern here would reject somebody's
    // actual council. Welsh communities, meetings rather than councils, and
    // apostrophes are all ordinary.
    for (const name of [
      "Cyngor Cymuned Llanddewi",
      "The Parish Meeting of Croxton",
      "St. Neots Town Council",
      "Bishop's Stortford Town Council",
    ]) {
      expect(stored(name)).toBe(name);
    }
  });

  it("rejects a name too long for the report footer", () => {
    expect(stored("A".repeat(121))).toBeUndefined();
    expect(stored("A".repeat(120))).toBe("A".repeat(120));
  });
});
