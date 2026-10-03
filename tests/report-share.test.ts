import { describe, expect, it } from "vitest";
import { reportShareUrl } from "@/lib/format-alert";

/**
 * The Share button on a report's page — the one share control a resident has.
 * The rule asserted is "The public share buttons": only a coordinator's share
 * reaches the public preview; a resident's needs a session in the village; a
 * report in the queue has none. `villagewatch.example` is a fixture, for the
 * reason `format-alert.test.ts` gives.
 */

const BASE = "https://villagewatch.example";
const ID = "7b0f8a52-5c5e-4b8a-9d3e-2f1c6a4b9e10";

describe("reportShareUrl", () => {
  it("gives a coordinator the public preview, singular", () => {
    expect(
      reportShareUrl({ id: ID, isPublic: true, isCoordinator: true, appUrl: BASE }),
    ).toBe(`${BASE}/incident/${ID}`);
  });

  it("gives a resident the signed-in page, plural — never the preview", () => {
    const url = reportShareUrl({
      id: ID,
      isPublic: true,
      isCoordinator: false,
      appUrl: BASE,
    });
    expect(url).toBe(`${BASE}/incidents/${ID}`);
    expect(url).not.toContain("/incident/");
  });

  it("gives nobody a link to a report that is not public", () => {
    for (const isCoordinator of [true, false]) {
      expect(
        reportShareUrl({ id: ID, isPublic: false, isCoordinator, appUrl: BASE }),
      ).toBeNull();
    }
  });

  it("falls back to a relative path on a base that does not parse", () => {
    expect(
      reportShareUrl({ id: ID, isPublic: true, isCoordinator: false, appUrl: "not a url" }),
    ).toBe(`/incidents/${ID}`);
  });
});
