import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `POST /api/incidents` — the third route handler in this suite, and the one
 * the backlog has been asking for by name since 27 July: **nothing anywhere
 * asserted that a village with auto-approve off still queues.**
 *
 * That sentence is in `BACKLOG.md` (L5), in `CLAUDE.md`'s "Not built yet", and
 * in `docs/E2E_VERIFICATION.md`'s list of what a static review cannot tell you.
 * It is the regression worth having a test for because of the shape of the
 * failure: a report filed straight to `PUBLISHED` in a village that asked for a
 * queue is on the map, in the push, and — where the village also runs a
 * WhatsApp Channel — one paste from the open internet, with the reporter's
 * verbatim wording in it whenever the AI pass did not run. Nothing on any
 * screen says it went wrong. The coordinator finds out when a neighbour does.
 *
 * What this file pins, in the order the route decides it:
 *
 *   * **The compliance gate refuses before the body is parsed and before a
 *     rate-limit slot is spent.** A village that cannot lawfully accept a
 *     report must not have one written, and a resident whose village is
 *     blocked must not lose a slot out of their daily ten to find that out.
 *   * **The village is the tenant boundary** (domain rule 4) — it comes off the
 *     session profile, and a `villageId` in the request body changes nothing.
 *   * **A storage path is not proof of ownership.** Media under somebody else's
 *     prefix is a 403 and no row.
 *   * **Auto-approve off files `PENDING_REVIEW`** and tells the coordinators;
 *     the village hears nothing, and no `incident.publish` row is written.
 *   * **Auto-approve on files `PUBLISHED`** and owes the full fan-out — the
 *     village push, the staff line, and an `incident.publish` row carrying
 *     `autoApproved: true` and **no `before`**, because there was no review.
 *   * **`moderatedById` and `moderatedAt` stay null either way.** Nobody
 *     moderated it, and filling them with the reporter would put a resident's
 *     name against a review that did not happen.
 *   * **The setting fails closed.** `getVillageAutoApprove` is left *real* here
 *     and its `SELECT` is what the mock throws from, so "a database error means
 *     the queue" is exercised through the route rather than asserted against a
 *     stub that was told to return false.
 *
 * That last decision is why `village.findUnique` is mocked by its `select`
 * rather than by call order: the route reads the village twice for two
 * different reasons — once for the reference, once for the setting — and a mock
 * that could not tell them apart would have to fake the module boundary the
 * fail-closed behaviour actually lives at.
 *
 * The limiter is left real with its Postgres counter mocked, the way
 * `rate-limit.test.ts` and `incident-vote-route.test.ts` do it, so the eleventh
 * report of the day is refused by the key the SQL uses.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  canVillageAcceptIncidents: vi.fn(),
  villageFindUnique: vi.fn(),
  incidentAggregate: vi.fn(),
  incidentCreate: vi.fn(),
  auditCreate: vi.fn(),
  queryRaw: vi.fn(),
  notifyCoordinators: vi.fn(),
  notifyPublished: vi.fn(),
  emailPublished: vi.fn(),
  notifySlack: vi.fn(),
  /** Read through a getter below, so a test can turn the AI pass on. */
  ai: { configured: false },
}));

vi.mock("@/lib/auth", () => ({ getSession: mocks.getSession }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    village: { findUnique: mocks.villageFindUnique },
    incident: {
      aggregate: mocks.incidentAggregate,
      create: mocks.incidentCreate,
    },
    auditLog: { create: mocks.auditCreate },
    $queryRaw: mocks.queryRaw,
  },
}));

vi.mock("@/lib/compliance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/compliance")>();
  return {
    ...actual,
    canVillageAcceptIncidents: mocks.canVillageAcceptIncidents,
  };
});

vi.mock("@/lib/notifications", () => ({
  notifyCoordinatorsOfPendingReport: mocks.notifyCoordinators,
  notifyIncidentPublished: mocks.notifyPublished,
  emailIncidentPublished: mocks.emailPublished,
}));

vi.mock("@/lib/slack", () => ({ notifySlack: mocks.notifySlack }));

vi.mock("@/lib/ai/client", () => ({
  get isAiConfigured() {
    return mocks.ai.configured;
  },
}));

const { NextRequest } = await import("next/server");
const { POST } = await import("@/app/api/incidents/route");

const USER_ID = "22222222-2222-2222-2222-222222222222";
const VILLAGE_ID = "33333333-3333-3333-3333-333333333333";
const OTHER_VILLAGE_ID = "44444444-4444-4444-4444-444444444444";
const INCIDENT_ID = "11111111-1111-1111-1111-111111111111";

/** `(userId, action, windowStart)` → count, which is what the index is. */
const counters = new Map<string, number>();

/** Whatever the next `getVillageAutoApprove` SELECT should answer. */
let autoApprove: boolean | "throws" = false;

function session(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: USER_ID, email: "sam@example.test" },
    profile: { villageId: VILLAGE_ID, role: "RESIDENT" },
    ...overrides,
  };
}

/** A payload that passes `incidentReportSchema` with nothing to spare. */
function report(overrides: Record<string, unknown> = {}) {
  return {
    type: "VEHICLE_CRIME",
    severity: "MEDIUM",
    title: "Van window smashed on Mill Lane",
    description: "A van window was smashed overnight near the bus stop.",
    occurredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    lat: 52.2583,
    lng: 0.1049,
    locationText: "Mill Lane",
    isAnonymous: false,
    reportedToPolice: false,
    media: [],
    tags: ["vehicle", "overnight"],
    ...overrides,
  };
}

function post(body: unknown) {
  const request = new NextRequest("http://localhost/api/incidents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return POST(request);
}

/** The `data` object the route handed `incident.create`. */
function created() {
  return mocks.incidentCreate.mock.calls[0]?.[0].data;
}

/** Every `AuditLog` row the route wrote, by action. */
function auditRows(action: string) {
  return mocks.auditCreate.mock.calls
    .map((call) => call[0].data)
    .filter((row) => row.action === action);
}

beforeEach(() => {
  counters.clear();
  autoApprove = false;
  mocks.ai.configured = false;
  vi.stubEnv("DATABASE_URL", "postgres://test");

  mocks.getSession.mockReset().mockResolvedValue(session());
  mocks.canVillageAcceptIncidents.mockReset().mockResolvedValue(true);
  mocks.incidentAggregate
    .mockReset()
    .mockResolvedValue({ _max: { villageIncidentNumber: 2 } });
  mocks.incidentCreate.mockReset().mockImplementation((args: {
    data: { reference: string; status: string };
  }) =>
    Promise.resolve({
      id: INCIDENT_ID,
      reference: args.data.reference,
      status: args.data.status,
    }),
  );
  mocks.auditCreate.mockReset().mockResolvedValue({});
  mocks.notifyCoordinators.mockReset().mockResolvedValue(undefined);
  mocks.notifyPublished.mockReset().mockResolvedValue(undefined);
  mocks.emailPublished.mockReset().mockResolvedValue(undefined);
  mocks.notifySlack.mockReset().mockResolvedValue(undefined);

  // Two reads of the same row for two different reasons. Told apart by what
  // they select, because that is what actually distinguishes them.
  mocks.villageFindUnique.mockReset().mockImplementation((args: {
    select?: Record<string, boolean>;
  }) => {
    if (args.select?.autoApprove) {
      if (autoApprove === "throws") {
        return Promise.reject(new Error("column village.auto_approve missing"));
      }
      return Promise.resolve({ autoApprove });
    }

    return Promise.resolve({
      id: VILLAGE_ID,
      name: "Histon",
      villageCode: null,
    });
  });

  mocks.queryRaw.mockReset().mockImplementation(
    (
      _strings: TemplateStringsArray,
      subject: string,
      action: string,
      windowStart: Date,
    ) => {
      const key = `${subject}|${action}|${windowStart.getTime()}`;
      const count = (counters.get(key) ?? 0) + 1;
      counters.set(key, count);
      return Promise.resolve([{ count }]);
    },
  );
});

describe("who may file", () => {
  it("refuses a signed-out caller", async () => {
    mocks.getSession.mockResolvedValue(null);

    const response = await post(report());

    expect(response.status).toBe(401);
    expect(mocks.incidentCreate).not.toHaveBeenCalled();
  });

  it("refuses a session with no village", async () => {
    // A Google sign-up part-way through `/welcome`. There is no village to
    // scope the row to, and the village is the tenant boundary.
    mocks.getSession.mockResolvedValue(session({ profile: null }));

    const response = await post(report());

    expect(response.status).toBe(403);
    expect(mocks.incidentCreate).not.toHaveBeenCalled();
  });
});

describe("the compliance gate", () => {
  it("refuses before the body is parsed and before a slot is spent", async () => {
    mocks.canVillageAcceptIncidents.mockResolvedValue(false);

    const response = await post(report());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("compliance_incomplete");
    expect(mocks.incidentCreate).not.toHaveBeenCalled();

    // The half that is easy to lose in a refactor: a resident whose village is
    // blocked must not pay one of their ten daily reports to be told so.
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });

  it("refuses a payload it never had to validate", async () => {
    // 403 rather than 422 — the village cannot accept this report whatever is
    // in it, and describing the field rules would be answering a question the
    // caller is not going to get to ask.
    mocks.canVillageAcceptIncidents.mockResolvedValue(false);

    const response = await post({ nonsense: true });

    expect(response.status).toBe(403);
  });
});

describe("the tenant boundary", () => {
  it("takes the village from the session and ignores the body", async () => {
    await post(report({ villageId: OTHER_VILLAGE_ID, status: "PUBLISHED" }));

    expect(created().villageId).toBe(VILLAGE_ID);
    // A client-supplied status is the escalation the queue exists to prevent.
    expect(created().status).toBe("PENDING_REVIEW");
  });

  it("refuses media under another resident's prefix", async () => {
    const response = await post(
      report({
        media: [
          {
            storagePath: `${VILLAGE_ID}/${OTHER_VILLAGE_ID}/photo.jpg`,
            thumbnailPath: `${VILLAGE_ID}/${OTHER_VILLAGE_ID}/photo-thumb.jpg`,
            mimeType: "image/jpeg",
            fileSize: 1024,
            width: 1200,
            height: 900,
            facesDetected: 0,
          },
        ],
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.incidentCreate).not.toHaveBeenCalled();
  });
});

describe("auto-approve off — the queue", () => {
  it("files the report as PENDING_REVIEW", async () => {
    const response = await post(report());
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(created().status).toBe("PENDING_REVIEW");
    expect(body.status).toBe("PENDING_REVIEW");
    expect(body.autoApproved).toBe(false);
  });

  it("tells the coordinators and nobody else", async () => {
    await post(report());

    expect(mocks.notifyCoordinators).toHaveBeenCalledTimes(1);
    // Domain rule 6: a report in the queue has not cleared moderation, so
    // nothing about it reaches a resident's phone or the WhatsApp Channel.
    expect(mocks.notifyPublished).not.toHaveBeenCalled();
    expect(mocks.notifySlack).not.toHaveBeenCalled();
  });

  it("writes incident.create and no incident.publish", async () => {
    await post(report());

    const create = auditRows("incident.create");
    expect(create).toHaveLength(1);
    expect(create[0].after.status).toBe("PENDING_REVIEW");
    expect(create[0].after.autoApproved).toBe(false);

    // A publish row here would put a report in the audit viewer's "Published"
    // filter that no resident can see.
    expect(auditRows("incident.publish")).toHaveLength(0);
  });

  it("does not offer the reporter a WhatsApp alert", async () => {
    // The alert is on the success screen only for a report that is actually
    // live, and only to somebody who moderates the village.
    const body = await (await post(report())).json();

    expect(body.alert).toBeUndefined();
  });

  it("fails closed to the queue when the setting cannot be read", async () => {
    autoApprove = "throws";

    const response = await post(report());

    expect(response.status).toBe(201);
    expect(created().status).toBe("PENDING_REVIEW");
    expect(mocks.notifyPublished).not.toHaveBeenCalled();
    // And nothing lands in a resident's inbox about a report the village has
    // not cleared (domain rule 6).
    expect(mocks.emailPublished).not.toHaveBeenCalled();
  });
});

describe("auto-approve on — published on arrival", () => {
  beforeEach(() => {
    autoApprove = true;
  });

  it("files the report as PUBLISHED", async () => {
    const body = await (await post(report())).json();

    expect(created().status).toBe("PUBLISHED");
    expect(body.status).toBe("PUBLISHED");
    expect(body.autoApproved).toBe(true);
  });

  it("owes the village the same fan-out a coordinator's Approve does", async () => {
    await post(report());

    expect(mocks.notifyPublished).toHaveBeenCalledTimes(1);
    // The email is the third surface of that fan-out, and it goes on a publish
    // rather than on every dispatch — see `emailIncidentPublished`.
    expect(mocks.emailPublished).toHaveBeenCalledTimes(1);
    expect(mocks.notifySlack).toHaveBeenCalledTimes(1);
    // Nobody is waiting on a queue that this report never entered.
    expect(mocks.notifyCoordinators).not.toHaveBeenCalled();
  });

  it("emails the anonymised description and never the reporter's wording", async () => {
    await post(
      report({
        description: "A van window was smashed overnight near the bus stop.",
        rawDescription: "Dave at number 42 smashed the window on the white van.",
      }),
    );

    const emailed = mocks.emailPublished.mock.calls[0]?.[0];

    expect(emailed.description).toBe(
      "A van window was smashed overnight near the bus stop.",
    );
    // Domain rule 1. An inbox is the one place a leak is permanent and
    // forwarded, so the payload has no field that could carry the raw column.
    expect(JSON.stringify(emailed)).not.toContain("number 42");
    expect(emailed.rawDescription).toBeUndefined();
    expect(emailed.reference).toBeTruthy();
  });

  it("writes an incident.publish row with no before", async () => {
    await post(report());

    const [publish] = auditRows("incident.publish");

    expect(publish.after).toEqual({ status: "PUBLISHED", autoApproved: true });
    // A `before` of PENDING_REVIEW would record a review that never happened.
    expect(publish.before).toBeUndefined();
  });

  it("offers the alert to a coordinator and not to a resident", async () => {
    const resident = await (await post(report())).json();
    expect(resident.alert).toBeUndefined();

    mocks.getSession.mockResolvedValue(
      session({ profile: { villageId: VILLAGE_ID, role: "COORDINATOR" } }),
    );
    mocks.incidentCreate.mockClear();

    const coordinator = await (await post(report())).json();
    expect(coordinator.alert).toContain("Van window smashed on Mill Lane");
  });
});

describe("what the row records either way", () => {
  it("never fills the moderation columns", async () => {
    for (const setting of [false, true]) {
      autoApprove = setting;
      mocks.incidentCreate.mockClear();

      await post(report());

      // Nobody moderated it. Naming the reporter here would put a resident
      // against a review that did not occur.
      expect(created().moderatedById).toBeUndefined();
      expect(created().moderatedAt).toBeUndefined();
    }
  });

  it("stores the reporter's wording apart from the published text", async () => {
    await post(
      report({
        description: "A vehicle window was broken overnight.",
        rawDescription: "Dave at number 12 said he saw the blue Transit again.",
      }),
    );

    expect(created().rawDescription).toBe(
      "Dave at number 12 said he saw the blue Transit again.",
    );
    expect(created().description).toBe(
      "A vehicle window was broken overnight.",
    );
  });

  it("duplicates the reporter's wording when the AI pass did not run", async () => {
    // Both columns hold the same text, which is safe precisely because the
    // report is in the queue.
    await post(report({ description: "A van window was smashed overnight." }));

    expect(created().rawDescription).toBe(created().description);
    expect(created().anonymized).toBe(false);
  });

  it("ignores an ai block on a deployment with no key", async () => {
    // Provenance, not authorisation. The server's own say-so decides whether a
    // rewrite could have happened, never the browser's claim that one did.
    await post(
      report({
        ai: {
          model: "claude-sonnet-5",
          confidence: 0.9,
          peopleCount: 1,
          recurring: true,
          patternNote: "Third this month",
        },
      }),
    );

    expect(created().anonymized).toBe(false);
    expect(created().aiModel).toBeUndefined();
    expect(created().recurring).toBe(false);
  });

  it("fuzzes the coordinates it stores", async () => {
    // Domain rule 2. The exact point is never persisted, so it cannot leak.
    await post(report({ lat: 52.2583, lng: 0.1049 }));

    expect(created().lat).not.toBe(52.2583);
    expect(created().lng).not.toBe(0.1049);
    expect(created().locationFuzzMeters).toBeGreaterThan(0);
  });

  it("numbers the reference within the village", async () => {
    // `MAX(villageIncidentNumber) + 1` for this village and this year — not a
    // count of every report on the deployment.
    await post(report());

    expect(created().villageIncidentNumber).toBe(3);
    expect(created().reference).toContain("HIS");
    expect(created().reference).toContain("0003");
  });
});

describe("the daily limit", () => {
  it("refuses the eleventh report of the day", async () => {
    for (let i = 0; i < 10; i += 1) {
      const ok = await post(report());
      expect(ok.status).toBe(201);
    }

    mocks.incidentCreate.mockClear();
    const refused = await post(report());

    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toBeTruthy();
    expect(mocks.incidentCreate).not.toHaveBeenCalled();
  });

  it("counts a malformed payload against nobody", async () => {
    // A rejected body costs a Zod parse. Burning a slot on one would let a
    // client-side bug spend a reporter's quota with nothing reaching the queue.
    const response = await post({ type: "NOT_A_TYPE" });

    expect(response.status).toBe(422);
    expect(mocks.queryRaw).not.toHaveBeenCalled();
  });
});
