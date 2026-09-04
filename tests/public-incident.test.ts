import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PUBLIC_PREVIEW_DESCRIPTION_CHARS } from "@/lib/constants";

/**
 * The two reads that answer without a session.
 *
 * Prisma is mocked at its module boundary, as everywhere else in this suite, so
 * this runs on a fresh clone with no `.env.local`. What it asserts is the set of
 * rules that decide whether a report shown to the open internet identifies
 * anybody:
 *
 *   * **The restricted columns are absent from the `select`, not merely dropped
 *     on the way out.** This is the assertion worth having. A mapper that
 *     forgets a field is a bug somebody notices; a `select` quietly widened to
 *     serve a second caller is a leak nothing on screen would show, because the
 *     page renders the same handful of facts either way. Asserting the query
 *     rather than the result is what catches it.
 *   * **The full description never leaves the module.** It is selected and then
 *     truncated here, so no caller can hold the whole string — which is what
 *     stops a page or a route handler shipping it to the browser and trimming
 *     it for display, where every link-preview crawler would still have had it.
 *   * **Only `PUBLISHED` and `RESOLVED`** (domain rule 6). Out here there is no
 *     signed-in resident to have got it wrong in front of.
 *   * **Only `ACTIVE` villages**, in both reads. A `PENDING` directory entry has
 *     no coordinator, and the 270 seeded parishes would otherwise turn the
 *     community counter into a number nobody can point at.
 *   * **A malformed id never reaches Postgres.** The column is `@db.Uuid` and
 *     Postgres rejects a bad one rather than returning no rows, so without the
 *     shape check a mistyped link is a 500 on a public page.
 *   * **Nothing throws.** These render for somebody who followed a link out of
 *     WhatsApp and has never heard of VillageWatch; an error page is the one
 *     outcome worth trading a 404 for.
 */

const mocks = vi.hoisted(() => ({
  incidentFindFirst: vi.fn(),
  incidentCount: vi.fn(),
  userCount: vi.fn(),
  villageCount: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    incident: {
      findFirst: mocks.incidentFindFirst,
      count: mocks.incidentCount,
    },
    user: { count: mocks.userCount },
    village: { count: mocks.villageCount },
  },
}));

import {
  getCommunityStats,
  getPublicIncidentPreview,
  publicIncidentPath,
} from "@/lib/public-incident";

const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

/**
 * Long enough to be cut, with spaces in the right places, and with something
 * identifying past the cut — which is the case the truncation exists for.
 */
const LONG_DESCRIPTION =
  "A garden shed was forced open overnight and power tools were taken from " +
  "inside it. The owner believes it happened at the property on Mill Lane " +
  "beside the old chapel, some time after midnight.";

/** A row shaped like what the `select` in the module asks Postgres for. */
const ROW = {
  id: ID,
  type: "VEHICLE_CRIME",
  severity: "HIGH",
  occurredAt: new Date("2026-09-01T21:00:00Z"),
  recurring: true,
  description: LONG_DESCRIPTION,
  anonymized: true,
  village: {
    id: "village-1",
    name: "Histon & Impington",
    region: "Cambridgeshire",
  },
};

/**
 * Every column that must never reach somebody with no account.
 * `rawDescription` is in the list for completeness — it is already absent from
 * every read in the codebase (domain rule 1) — and the rest are the ones that
 * are perfectly ordinary on a village map and re-identifying on the open
 * internet. `description` is deliberately **not** here: it is selected, and the
 * truncation below is what bounds it.
 */
const RESTRICTED = [
  "rawDescription",
  "title",
  "locationText",
  "lat",
  "lng",
  "reference",
  "patternNote",
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.DATABASE_URL = "postgres://test";
  mocks.incidentFindFirst.mockResolvedValue(ROW);
  mocks.incidentCount.mockResolvedValue(1284);
  mocks.userCount.mockResolvedValue(340);
  mocks.villageCount.mockResolvedValue(12);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getPublicIncidentPreview", () => {
  it("asks Postgres for none of the restricted columns", async () => {
    await getPublicIncidentPreview(ID);

    const { select } = mocks.incidentFindFirst.mock.calls[0][0];

    for (const column of RESTRICTED) {
      expect(select).not.toHaveProperty(column);
    }
  });

  it("returns only the fields the preview page renders", async () => {
    const preview = await getPublicIncidentPreview(ID);

    expect(Object.keys(preview ?? {}).sort()).toEqual([
      "anonymized",
      "descriptionExtract",
      "id",
      "occurredAt",
      "recurring",
      "severity",
      "type",
      "village",
    ]);

    // The village is a nested object and is the other place a column could
    // arrive by being added to its own `select`.
    expect(Object.keys(preview?.village ?? {}).sort()).toEqual([
      "id",
      "name",
      "region",
    ]);
  });

  it("truncates the description and never returns the whole column", async () => {
    const preview = await getPublicIncidentPreview(ID);
    const extract = preview?.descriptionExtract ?? "";

    expect(extract.length).toBeLessThanOrEqual(
      PUBLIC_PREVIEW_DESCRIPTION_CHARS,
    );
    expect(extract.endsWith("…")).toBe(true);
    expect(extract).not.toContain("Mill Lane");

    // The whole string must not survive anywhere on the returned object — a
    // second field carrying it would defeat the truncation entirely.
    expect(JSON.stringify(preview)).not.toContain(LONG_DESCRIPTION);
  });

  it("leaves a description that is already short alone", async () => {
    mocks.incidentFindFirst.mockResolvedValue({
      ...ROW,
      description: "Wing mirror snapped off overnight.",
    });

    const preview = await getPublicIncidentPreview(ID);

    expect(preview?.descriptionExtract).toBe(
      "Wing mirror snapped off overnight.",
    );
    expect(preview?.descriptionExtract.endsWith("…")).toBe(false);
  });

  it("narrows to published and resolved reports in an active village", async () => {
    await getPublicIncidentPreview(ID);

    const { where } = mocks.incidentFindFirst.mock.calls[0][0];

    expect(where.status).toEqual({ in: ["PUBLISHED", "RESOLVED"] });
    expect(where.village).toEqual({ status: "ACTIVE" });
    expect(where.id).toBe(ID);
  });

  it("returns null for a report the query does not match", async () => {
    mocks.incidentFindFirst.mockResolvedValue(null);

    await expect(getPublicIncidentPreview(ID)).resolves.toBeNull();
  });

  it("never sends a malformed id to Postgres", async () => {
    for (const id of ["", "not-a-uuid", "1", "../../etc/passwd", `${ID}'`]) {
      await expect(getPublicIncidentPreview(id)).resolves.toBeNull();
    }

    expect(mocks.incidentFindFirst).not.toHaveBeenCalled();
  });

  it("degrades to null rather than throwing when the query fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.incidentFindFirst.mockRejectedValue(new Error("connection refused"));

    await expect(getPublicIncidentPreview(ID)).resolves.toBeNull();
  });

  it("makes no query at all with no database configured", async () => {
    delete process.env.DATABASE_URL;

    await expect(getPublicIncidentPreview(ID)).resolves.toBeNull();
    expect(mocks.incidentFindFirst).not.toHaveBeenCalled();
  });
});

describe("getCommunityStats", () => {
  it("counts published reports, open accounts and live villages", async () => {
    await expect(getCommunityStats()).resolves.toEqual({
      incidents: 1284,
      residents: 340,
      villages: 12,
    });
  });

  it("counts only active villages, and only what is in them", async () => {
    await getCommunityStats();

    expect(mocks.incidentCount).toHaveBeenCalledWith({
      where: {
        status: { in: ["PUBLISHED", "RESOLVED"] },
        village: { status: "ACTIVE" },
      },
    });

    // A closed account has already had its `villageId` nulled by
    // `eraseAccount`; `deletedAt` is the backstop for a row closed some other
    // way, and a resident count that included them would overstate the figure.
    expect(mocks.userCount).toHaveBeenCalledWith({
      where: { deletedAt: null, village: { status: "ACTIVE" } },
    });

    /**
     * The one that would be quietly wrong. The directory holds 270 seeded
     * Cambridgeshire parishes at `PENDING` with nobody in them, so a village
     * count with no status predicate would publish "271 villages" on a
     * deployment running one — the invented figure `VILLAGES_LIVE` is null to
     * avoid.
     */
    expect(mocks.villageCount).toHaveBeenCalledWith({
      where: { status: "ACTIVE" },
    });
  });

  it("returns null rather than zeroes when a count fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.villageCount.mockRejectedValue(new Error("connection refused"));

    await expect(getCommunityStats()).resolves.toBeNull();
  });

  it("makes no query at all with no database configured", async () => {
    delete process.env.DATABASE_URL;

    await expect(getCommunityStats()).resolves.toBeNull();
    expect(mocks.incidentCount).not.toHaveBeenCalled();
  });
});

describe("publicIncidentPath", () => {
  /**
   * The singular is what keeps this page out of `PROTECTED_ROUTES`, which
   * matches `/incidents` exactly or with a trailing slash. Pluralising it here
   * would send every shared link to the authenticated detail page, and the
   * symptom would be a sign-in redirect rather than an error.
   */
  it("builds the public path and not the authenticated one", () => {
    expect(publicIncidentPath(ID)).toBe(`/incident/${ID}`);
    expect(publicIncidentPath(ID).startsWith("/incidents")).toBe(false);
  });
});
