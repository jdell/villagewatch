import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Registering interest in a village that is not in service.
 *
 * Three things are worth asserting here and none of them is wording.
 *
 * 1. **The motivation is dropped on the resident path.** It is the one
 *    free-text field on the form, it is only ever *shown* on the coordinator
 *    path, and a resident who typed a sentence, changed their mind and
 *    submitted would otherwise have it stored. The component unmounts the
 *    field; this asserts the schema drops it anyway, because a component is the
 *    wrong place for that to be the only guarantee.
 * 2. **Grouping folds spellings.** `village_name` is free text, so "Cottenham",
 *    "cottenham" and " Cottenham " are one village written three ways. A
 *    `GROUP BY village_name` reports three villages with one person each, which
 *    is the same data saying the opposite thing to whoever is deciding where to
 *    launch next.
 * 3. **A village with a coordinator candidate sorts above one without.** Forty
 *    residents waiting and nobody to run it is a village that *cannot* be
 *    activated, because `activateVillage` appoints a named person. An ordering
 *    by popularity would put the un-actionable thing at the top of the list
 *    somebody works from.
 *
 * The route's own rules are at the bottom: the write is the act, the Slack
 * alert fires for candidates only, and the alert never carries the motivation.
 */

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findMany: vi.fn(),
  rateLimit: vi.fn(),
  sendEmail: vi.fn(),
  notifyCoordinatorCandidate: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { villageInterest: { create: mocks.create, findMany: mocks.findMany } },
}));

vi.mock("@/lib/email/send", () => ({ sendEmail: mocks.sendEmail }));

vi.mock("@/lib/slack", () => ({
  notifyCoordinatorCandidate: mocks.notifyCoordinatorCandidate,
}));

vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>(
    "@/lib/rate-limit",
  );

  return { ...actual, rateLimit: mocks.rateLimit };
});

const { villageInterestSchema } = await import("@/lib/validations");
const { listVillageInterest } = await import("@/lib/village-interest");
const { NextRequest } = await import("next/server");
const { POST } = await import("@/app/api/village-interest/route");

/** A row as Prisma would hand it back. */
function row(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: crypto.randomUUID(),
    name: "Sarah Mitchell",
    email: "sarah.m@example.com",
    villageName: "Cottenham",
    county: "Cambridgeshire",
    role: "RESIDENT" as const,
    motivation: null,
    createdAt: new Date("2026-09-13T09:00:00Z"),
    ...overrides,
  };
}

function post(body: unknown) {
  return new NextRequest("http://localhost/api/village-interest", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-forwarded-for": "203.0.113.7",
    },
    body: JSON.stringify(body),
  });
}

const VALID = {
  fullName: "Sarah Mitchell",
  email: "sarah.m@example.com",
  villageName: "Cottenham",
  county: "Cambridgeshire",
  role: "resident",
};

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://test");
  mocks.create.mockResolvedValue({ id: "interest-1" });
  mocks.findMany.mockResolvedValue([]);
  mocks.rateLimit.mockResolvedValue({ ok: true });
  mocks.sendEmail.mockResolvedValue({ sent: false });
  mocks.notifyCoordinatorCandidate.mockResolvedValue({ posted: false });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("villageInterestSchema", () => {
  it("keeps a motivation on the coordinator path", () => {
    const parsed = villageInterestSchema.parse({
      ...VALID,
      role: "coordinator-candidate",
      motivation: "We've had a few break-ins.",
    });

    expect(parsed.motivation).toBe("We've had a few break-ins.");
  });

  it("drops a motivation posted on the resident path", () => {
    // The component unmounts the field; this is the guarantee that does not
    // depend on the component.
    const parsed = villageInterestSchema.parse({
      ...VALID,
      role: "resident",
      motivation: "typed before I changed my mind",
    });

    expect(parsed.motivation).toBeUndefined();
  });

  it("turns an empty motivation into absent rather than a blank", () => {
    const parsed = villageInterestSchema.parse({
      ...VALID,
      role: "coordinator-candidate",
      motivation: "   ",
    });

    // `reportController`'s rule: a value that is checked for truthiness must
    // not be able to hold a blank that counts. Here it is what stops the admin
    // view drawing an empty quote box under somebody's name.
    expect(parsed.motivation).toBeUndefined();
  });

  it("trims what it stores", () => {
    const parsed = villageInterestSchema.parse({
      ...VALID,
      villageName: "  Cottenham  ",
      county: " Cambridgeshire ",
    });

    expect(parsed.villageName).toBe("Cottenham");
    expect(parsed.county).toBe("Cambridgeshire");
  });

  it("refuses a role it does not know", () => {
    // The radio group posts one of two values; anything else is a hand-made
    // request, and `COORDINATOR` is the word it would reach for.
    expect(
      villageInterestSchema.safeParse({ ...VALID, role: "COORDINATOR" }).success,
    ).toBe(false);
  });
});

describe("listVillageInterest", () => {
  it("folds spellings of one village into one group", async () => {
    mocks.findMany.mockResolvedValue([
      row({ villageName: "Cottenham", name: "Ann" }),
      row({ villageName: "cottenham", name: "Tom" }),
      row({ villageName: "  COTTENHAM ", name: "Sarah" }),
    ]);

    const groups = await listVillageInterest();

    // A `GROUP BY village_name` would report three villages of one person each.
    expect(groups).toHaveLength(1);
    expect(groups[0].total).toBe(3);
  });

  it("labels a group with the spelling most people used", async () => {
    mocks.findMany.mockResolvedValue([
      row({ villageName: "cottenham", name: "Tom" }),
      row({ villageName: "Cottenham", name: "Ann" }),
      row({ villageName: "Cottenham", name: "Sarah" }),
    ]);

    const groups = await listVillageInterest();

    // Newest-first would have picked "cottenham" on a coin flip, and this is
    // the list a parish council gets quoted from.
    expect(groups[0].villageName).toBe("Cottenham");
  });

  it("keeps two genuinely different villages apart", async () => {
    mocks.findMany.mockResolvedValue([
      row({ villageName: "Cottenham", county: "Cambridgeshire" }),
      row({ villageName: "Cottenham", county: "Lincolnshire" }),
    ]);

    expect(await listVillageInterest()).toHaveLength(2);
  });

  it("puts a village with a coordinator candidate first", async () => {
    mocks.findMany.mockResolvedValue([
      row({ villageName: "Popular", name: "A" }),
      row({ villageName: "Popular", name: "B" }),
      row({ villageName: "Popular", name: "C" }),
      row({
        villageName: "Actionable",
        name: "D",
        role: "COORDINATOR_CANDIDATE",
      }),
    ]);

    const groups = await listVillageInterest();

    // Three people waiting and nobody to run it cannot be activated; one
    // volunteer can. The ordering puts the actionable thing on top.
    expect(groups[0].villageName).toBe("Actionable");
    expect(groups[0].coordinatorCandidates).toBe(1);
    expect(groups[1].total).toBe(3);
  });

  it("returns nothing rather than throwing when the table is missing", async () => {
    mocks.findMany.mockRejectedValue(new Error("relation does not exist"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    // The migration may not be applied, and this renders on the page an
    // administrator activates villages from.
    await expect(listVillageInterest()).resolves.toEqual([]);
  });
});

describe("POST /api/village-interest", () => {
  it("writes a row and creates no account", async () => {
    const response = await POST(post(VALID));

    expect(response.status).toBe(200);
    expect(mocks.create).toHaveBeenCalledTimes(1);

    // The point of the whole feature: nothing here mints a user. Asserted on
    // the mocked surface — this route imports no Supabase client at all, so
    // there is nothing it could call.
    const written = mocks.create.mock.calls[0][0].data;
    expect(written.role).toBe("RESIDENT");
    expect(written.motivation).toBeNull();
  });

  it("validates before spending a rate-limit slot", async () => {
    await POST(post({ ...VALID, email: "not-an-email" }));

    // This table's rule: a malformed request costs a Zod parse, and burning a
    // slot on one would let a client-side bug spend somebody's window.
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("refuses when the quota is spent", async () => {
    mocks.rateLimit.mockResolvedValue({ ok: false, retryAfter: 900 });

    const response = await POST(post(VALID));

    expect(response.status).toBe(429);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("emails both paths and alerts Slack for the candidate only", async () => {
    await POST(post(VALID));
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.notifyCoordinatorCandidate).not.toHaveBeenCalled();

    await POST(
      post({
        ...VALID,
        role: "coordinator-candidate",
        motivation: "Break-ins at number 42, I think it is the Hendersons.",
      }),
    );

    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(mocks.notifyCoordinatorCandidate).toHaveBeenCalledTimes(1);
  });

  it("never sends the motivation to Slack", async () => {
    await POST(
      post({
        ...VALID,
        role: "coordinator-candidate",
        motivation: "Break-ins at number 42, I think it is the Hendersons.",
      }),
    );

    /*
      The field somebody will want to add to that message. It is free text a
      stranger typed, and the two sentences it usually holds are what has been
      happening in their village and who they think is doing it — which is what
      `/privacy` §6 promises that channel never carries. Smuggled in and
      asserted absent, the way `format-social-post.test.ts` does it.
    */
    const alert = mocks.notifyCoordinatorCandidate.mock.calls[0][0];
    expect(JSON.stringify(alert)).not.toContain("number 42");
    expect(JSON.stringify(alert)).not.toContain("Hendersons");
    expect(alert.hasMotivation).toBe(true);
  });

  it("fails the request when the row cannot be written", async () => {
    mocks.create.mockRejectedValue(new Error("connection refused"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await POST(post(VALID));

    // The write is the act. Telling somebody their interest was registered
    // when no row exists is the one failure this form must not have — so
    // unlike the email and the Slack line, this is allowed to fail the request.
    expect(response.status).toBe(500);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
