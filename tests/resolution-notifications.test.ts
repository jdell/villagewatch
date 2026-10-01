import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The three dispatches a resolution fires, run for real against a mocked
 * Prisma. With no OneSignal or Resend key in the environment both transports
 * take their logging branch, which is a supported state and leaves everything
 * above them — the audience, the message, the failure handling — exercised.
 *
 * The voter push is the one worth reading. It is the only query in the app
 * that selects a voter, and what is pinned here is that its answer goes no
 * further than the dispatch: the result is a count, the message names nobody,
 * and a resident who has turned pushes off, left the village or closed their
 * account is not in the audience at all.
 */

const mocks = vi.hoisted(() => ({
  voteFindMany: vi.fn(),
  userFindFirst: vi.fn(),
  notificationCreateMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    incidentVote: { findMany: mocks.voteFindMany },
    user: { findFirst: mocks.userFindFirst },
    notification: { createMany: mocks.notificationCreateMany },
  },
}));

const {
  emailReporterOfResolution,
  notifyReporterOfResolution,
  notifyVotersOfResolution,
} = await import("@/lib/notifications");

const VILLAGE = "11111111-1111-4111-8111-111111111111";
const INCIDENT = "22222222-2222-4222-8222-222222222222";
const COORDINATOR = "33333333-3333-4333-8333-333333333333";
const REPORTER = "44444444-4444-4444-8444-444444444444";

const resolved = {
  villageId: VILLAGE,
  villageName: "Histon",
  incidentId: INCIDENT,
  reference: "VW-HIS-2026-0007",
  title: "Bus shelter glass smashed",
  reporterId: REPORTER,
  note: "Police attended and the glass was replaced.",
};

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://test";
  delete process.env.RESEND_API_KEY;
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.notificationCreateMany.mockResolvedValue({ count: 0 });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("notifyVotersOfResolution", () => {
  it("asks for voters still in the village, still open and still taking pushes", async () => {
    mocks.voteFindMany.mockResolvedValue([]);

    await notifyVotersOfResolution({
      ...resolved,
      exclude: [REPORTER, COORDINATOR],
    });

    const { where, select } = mocks.voteFindMany.mock.calls[0][0];
    expect(where).toEqual({
      incidentId: INCIDENT,
      userId: { notIn: [REPORTER, COORDINATOR] },
      user: { villageId: VILLAGE, deletedAt: null, notifyPush: true },
    });
    // The user id and nothing about how they voted.
    expect(select).toEqual({ userId: true });
  });

  it("drops a null from the exclusions rather than sending it to Postgres", async () => {
    mocks.voteFindMany.mockResolvedValue([]);

    await notifyVotersOfResolution({
      ...resolved,
      reporterId: null,
      exclude: [null, COORDINATOR],
    });

    expect(mocks.voteFindMany.mock.calls[0][0].where.userId).toEqual({
      notIn: [COORDINATOR],
    });
  });

  it("returns a count, and its message names nobody", async () => {
    mocks.voteFindMany.mockResolvedValue([
      { userId: "55555555-5555-4555-8555-555555555555" },
      { userId: "66666666-6666-4666-8666-666666666666" },
    ]);

    const result = await notifyVotersOfResolution({
      ...resolved,
      exclude: [REPORTER, COORDINATOR],
    });

    expect(result).toEqual({ matched: 2, sent: 0, skipped: "not_configured" });

    // One in-app notification per voter, carrying the reference and the note
    // and not the reporter-authored title.
    const { data } = mocks.notificationCreateMany.mock.calls[0][0];
    expect(data).toHaveLength(2);
    for (const row of data) {
      expect(row.body).toContain("VW-HIS-2026-0007");
      expect(row.body).toContain("Police attended");
      expect(row.body).not.toContain("Bus shelter");
      expect(row.title).not.toContain(REPORTER);
    }
  });

  it("sends nothing when nobody voted", async () => {
    mocks.voteFindMany.mockResolvedValue([]);

    const result = await notifyVotersOfResolution({
      ...resolved,
      exclude: [REPORTER, COORDINATOR],
    });

    expect(result).toEqual({ matched: 0, sent: 0, skipped: "no_recipients" });
    expect(mocks.notificationCreateMany).not.toHaveBeenCalled();
  });

  it("resolves to a value when the read fails, rather than throwing", async () => {
    mocks.voteFindMany.mockRejectedValue(new Error("connection reset"));

    await expect(
      notifyVotersOfResolution({ ...resolved, exclude: [] }),
    ).resolves.toEqual({ matched: 0, sent: 0, skipped: "failed" });
  });
});

describe("notifyReporterOfResolution", () => {
  it("tells the reporter, with the reference and the note", async () => {
    const result = await notifyReporterOfResolution(resolved);

    expect(result).toEqual({ matched: 1, sent: 0, skipped: "not_configured" });
    const [row] = mocks.notificationCreateMany.mock.calls[0][0].data;
    expect(row.userId).toBe(REPORTER);
    expect(row.body).toBe(
      "Your report VW-HIS-2026-0007 has been resolved — Police attended and the glass was replaced.",
    );
  });

  it("truncates a long note to fit a lock screen", async () => {
    await notifyReporterOfResolution({ ...resolved, note: "x".repeat(600) });

    const [row] = mocks.notificationCreateMany.mock.calls[0][0].data;
    expect(row.body.length).toBeLessThan(250);
    expect(row.body.endsWith("…")).toBe(true);
  });

  it("does nothing for a report whose reporter closed their account", async () => {
    const result = await notifyReporterOfResolution({
      ...resolved,
      reporterId: null,
    });

    expect(result).toEqual({ matched: 0, sent: 0, skipped: "no_recipients" });
    expect(mocks.notificationCreateMany).not.toHaveBeenCalled();
  });
});

describe("emailReporterOfResolution", () => {
  it("looks the reporter up as an open account, and sends them the note", async () => {
    mocks.userFindFirst.mockResolvedValue({
      email: "reporter@example.test",
      fullName: "Alex Reporter",
    });

    const result = await emailReporterOfResolution(resolved);

    expect(mocks.userFindFirst.mock.calls[0][0].where).toEqual({
      id: REPORTER,
      deletedAt: null,
    });
    // No key in the environment: logged rather than sent, which is the
    // transport's own supported state.
    expect(result).toEqual({ sent: false, skipped: "not_configured" });
  });

  it("sends nothing to a closed account", async () => {
    mocks.userFindFirst.mockResolvedValue(null);

    await expect(emailReporterOfResolution(resolved)).resolves.toEqual({
      sent: false,
      skipped: "no_recipient",
    });
  });

  it("resolves to a value when the lookup fails, rather than throwing", async () => {
    mocks.userFindFirst.mockRejectedValue(new Error("connection reset"));

    await expect(emailReporterOfResolution(resolved)).resolves.toEqual({
      sent: false,
      skipped: "failed",
    });
  });
});
