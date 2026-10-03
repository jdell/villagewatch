import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The pending-report push's action buttons — Approve and Review.
 *
 * Two layers. `pendingReportMessage` is pure and pins what the coordinator is
 * offered: the tap opens the report, Approve opens it with the confirmation
 * already open, Review opens the queue, and there is no Reject, because a
 * rejection needs a reason and a notification cannot collect one. Then the
 * dispatch is run with OneSignal "configured" and its SDK mocked, to pin that
 * the buttons leave as `web_buttons` with absolute URLs — `buttons` is the
 * native-app field and has nowhere to put a link.
 *
 * No secret and no database: the OneSignal keys are fixtures set before the
 * module loads, and Prisma is mocked at its boundary.
 */

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  notificationCreateMany: vi.fn(),
  createNotification: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    notification: { createMany: mocks.notificationCreateMany },
  },
}));

vi.mock("@onesignal/node-onesignal", () => ({
  createConfiguration: () => ({}),
  DefaultApi: class {
    createNotification = mocks.createNotification;
  },
  Notification: class {},
}));

const VILLAGE = "11111111-1111-4111-8111-111111111111";
const INCIDENT = "22222222-2222-4222-8222-222222222222";
const COORDINATOR = "33333333-3333-4333-8333-333333333333";
const BASE = "https://villagewatch.example";

const pending = {
  villageId: VILLAGE,
  incidentId: INCIDENT,
  reference: "VW-HIS-2026-0012",
  title: "Van parked across the school gate",
  severity: "MEDIUM" as const,
};

async function load() {
  vi.resetModules();
  // Read at module load, which is why the import is inside this function.
  process.env.ONESIGNAL_APP_ID = "app-fixture";
  process.env.ONESIGNAL_REST_API_KEY = "key-fixture";
  process.env.NEXT_PUBLIC_APP_URL = BASE;
  return import("@/lib/notifications");
}

beforeEach(() => {
  process.env.DATABASE_URL = "postgres://test";
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.notificationCreateMany.mockResolvedValue({ count: 1 });
  mocks.createNotification.mockResolvedValue({ id: "n-1", recipients: 1 });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("pendingReportMessage", () => {
  it("opens the report on a plain tap", async () => {
    const { pendingReportMessage } = await load();
    expect(pendingReportMessage(pending).path).toBe(`/incidents/${INCIDENT}`);
  });

  it("offers Approve, which opens the confirmation, and Review, which opens the queue", async () => {
    const { pendingReportMessage } = await load();

    expect(pendingReportMessage(pending).actions).toEqual([
      {
        id: "approve",
        text: "Approve",
        path: `/incidents/${INCIDENT}?action=approve`,
      },
      { id: "review", text: "Review", path: "/dashboard/queue" },
    ]);
  });

  it("offers no Reject", async () => {
    const { pendingReportMessage } = await load();
    const ids = pendingReportMessage(pending).actions?.map((a) => a.id) ?? [];
    expect(ids).not.toContain("reject");
  });

  it("carries the reference and title and nothing from the description", async () => {
    const { pendingReportMessage } = await load();
    const message = pendingReportMessage(pending);
    expect(message.body).toBe(`${pending.reference} — ${pending.title}`);
  });
});

describe("notifyCoordinatorsOfPendingReport", () => {
  it("sends the buttons as web_buttons with absolute URLs", async () => {
    const { notifyCoordinatorsOfPendingReport } = await load();
    mocks.userFindMany.mockResolvedValue([{ id: COORDINATOR }]);

    const result = await notifyCoordinatorsOfPendingReport({
      ...pending,
      reporterId: null,
    });

    expect(result.sent).toBe(1);
    const sent = mocks.createNotification.mock.calls[0][0];
    expect(sent.web_url).toBe(`${BASE}/incidents/${INCIDENT}`);
    expect(sent.web_buttons).toEqual([
      {
        id: "approve",
        text: "Approve",
        url: `${BASE}/incidents/${INCIDENT}?action=approve`,
      },
      { id: "review", text: "Review", url: `${BASE}/dashboard/queue` },
    ]);
    // The native-app field carries no URL; sending it would be a button that
    // does nothing on the web.
    expect(sent.buttons).toBeUndefined();
  });

  it("adds no buttons to a push that does not ask for them", async () => {
    const { notifyApplicantOfCoordinatorDecision } = await load();

    await notifyApplicantOfCoordinatorDecision({
      villageId: VILLAGE,
      userId: COORDINATOR,
      approved: true,
    });

    expect(mocks.createNotification).toHaveBeenCalledTimes(1);
    expect(mocks.createNotification.mock.calls[0][0].web_buttons).toBeUndefined();
  });
});
