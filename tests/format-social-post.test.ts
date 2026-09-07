import { describe, expect, it } from "vitest";
import { formatSocialPost, type SocialIncident } from "@/lib/digest/format-social-post";
import { SOCIAL_POST_MAX_INCIDENTS } from "@/lib/constants";

/**
 * A Facebook post is the widest surface in the codebase — public to anyone at
 * all, indexed, forwarded, and not recallable by deleting it. So what is
 * asserted here is not that a string is assembled but the four properties that
 * make this format safe to hand a coordinator a button for:
 *
 *   * **no description and no title reach it**, in any form, which is the one
 *     real difference from the WhatsApp alert and the whole privacy argument
 *     for the format;
 *   * **the emergency disclaimer is always present**, in a good week and a bad
 *     one, because the failure that matters is a neighbour reporting a
 *     break-in here instead of dialling 999;
 *   * **an absent trend says nothing** rather than claiming a rise from zero,
 *     the same refusal `severity-context.ts` makes about a young village;
 *   * **the count in the heading is the real one** even when the list is
 *     capped, and the remainder is stated rather than dropped.
 *
 * The base URL is `https://villagewatch.example` rather than the real domain,
 * for `tests/format-alert.test.ts`'s reason: it is a fixture, and an assertion
 * against the production host would still pass if the argument were ignored.
 *
 * No wording is asserted beyond the disclaimer's two phone numbers and the
 * shape of a line. This is copy under revision, and a test that failed whenever
 * somebody improved a sentence is the one `compliance-documents.test.ts`
 * explains why this suite does not write.
 */

const BASE = "https://villagewatch.example";

const WINDOW = {
  windowStart: new Date("2026-07-22T09:00:00Z"),
  windowEnd: new Date("2026-07-29T09:00:00Z"),
};

function post(
  incidents: readonly SocialIncident[],
  overrides: Partial<Parameters<typeof formatSocialPost>[0]> = {},
): string {
  return formatSocialPost({
    villageName: "Histon",
    villageSlug: "histon-cambridgeshire",
    joinCode: "OAK7X2",
    incidents,
    ...WINDOW,
    baseUrl: BASE,
    ...overrides,
  });
}

const BURGLARY: SocialIncident = {
  type: "BURGLARY",
  severity: "HIGH",
  locationText: "Church Row",
};

const NOISE: SocialIncident = {
  type: "ANTISOCIAL_BEHAVIOUR",
  severity: "LOW",
  locationText: "Recreation ground",
};

describe("what may be in a public post", () => {
  it("carries the severity, the type and the landmark and nothing else", () => {
    const text = post([BURGLARY]);

    expect(text).toContain("🔴 Burglary — Church Row");
  });

  it("has no field for a description, a title or coordinates", () => {
    /*
      The structural guard, asserted through the type rather than the output:
      `SocialIncident` is the only thing the formatter accepts, so a column that
      could carry a resident's wording cannot be threaded into a post without
      widening this type — which is the direction it is meant to fail in. The
      cast is what makes the assertion meaningful: it proves the extra fields
      are *ignored* rather than merely unreachable, so a route that
      over-selected could not leak one through.
    */
    const smuggled = {
      ...BURGLARY,
      title: "Break-in at the Harpers' place on Mill Lane",
      description: "Dave at number 14 heard glass at 2am",
      rawDescription: "YK19 RTF, the Harper boy from Mill Lane",
      lat: 52.561,
      lng: -1.464,
    } as SocialIncident;

    const text = post([smuggled]);

    expect(text).not.toContain("Harper");
    expect(text).not.toContain("Dave");
    expect(text).not.toContain("YK19");
    expect(text).not.toContain("52.561");
    expect(text).not.toContain("Break-in");
  });

  it("says a landmark is missing rather than dropping the report", () => {
    // It happened and it counts. A silently shorter list under a heading giving
    // the real total is a post that does not add up.
    const text = post([{ ...BURGLARY, locationText: null }]);

    expect(text).toContain("🔴 Burglary — location not given");
    expect(text).toContain("1 report");
  });

  it("treats a whitespace-only landmark as missing", () => {
    expect(post([{ ...BURGLARY, locationText: "   " }])).toContain(
      "location not given",
    );
  });
});

describe("the emergency disclaimer", () => {
  it("is present when something was reported", () => {
    const text = post([BURGLARY, NOISE]);

    expect(text).toContain("999");
    expect(text).toContain("101");
    expect(text).toContain("not an emergency service");
  });

  it("is present in a week with nothing in it", () => {
    // The case most likely to be lost to a shortcut: an empty week is the post
    // a coordinator is most tempted to skip and the one a stranger is as likely
    // to read first.
    const text = post([]);

    expect(text).toContain("999");
    expect(text).toContain("101");
  });

  it("is the last thing in the post", () => {
    const lines = post([BURGLARY]).trimEnd().split("\n");

    expect(lines.at(-1)).toContain("not reach the police");
  });
});

describe("the heading and the window", () => {
  it("names the village and collapses a shared month", () => {
    const text = post([BURGLARY]);

    expect(text).toContain("🛡️ This week in Histon");
    expect(text).toContain("22 – 29 July 2026");
  });

  it("keeps both months when the window straddles one", () => {
    const text = post([BURGLARY], {
      windowStart: new Date("2026-07-29T09:00:00Z"),
      windowEnd: new Date("2026-08-05T09:00:00Z"),
    });

    expect(text).toContain("29 July – 5 August 2026");
  });

  it("keeps both years when the window straddles one", () => {
    const text = post([BURGLARY], {
      windowStart: new Date("2026-12-28T09:00:00Z"),
      windowEnd: new Date("2027-01-04T09:00:00Z"),
    });

    expect(text).toContain("28 December 2026 – 4 January 2027");
  });

  it("prints one date when the window is a single day", () => {
    const day = new Date("2026-07-22T09:00:00Z");
    const text = post([BURGLARY], { windowStart: day, windowEnd: day });

    expect(text).toContain("22 July 2026 · 1 report");
    expect(text).not.toContain("–");
  });

  it("says the count in the heading, singular and plural", () => {
    expect(post([BURGLARY])).toContain("· 1 report");
    expect(post([BURGLARY, NOISE])).toContain("· 2 reports");
    expect(post([])).toContain("· no reports");
  });
});

describe("ordering and the cap", () => {
  it("puts the most serious first, whatever order it was handed", () => {
    const text = post([
      NOISE,
      { type: "THEFT", severity: "CRITICAL", locationText: "The Green" },
      BURGLARY,
    ]);

    const lines = text.split("\n").filter((line) => line.includes(" — "));

    expect(lines[0]).toContain("🟣");
    expect(lines[1]).toContain("🔴");
    expect(lines[2]).toContain("🟢");
  });

  it("caps the list and says how many are left", () => {
    const many: SocialIncident[] = Array.from(
      { length: SOCIAL_POST_MAX_INCIDENTS + 3 },
      () => NOISE,
    );

    const text = post(many);

    // The heading's count is the honest one; the list is what is bounded.
    expect(text).toContain(`· ${SOCIAL_POST_MAX_INCIDENTS + 3} reports`);
    expect(text).toContain("…and 3 more reports.");
    expect(text.split("\n").filter((line) => line.includes(" — "))).toHaveLength(
      SOCIAL_POST_MAX_INCIDENTS,
    );
  });

  it("does not say anything about a remainder when there is none", () => {
    expect(post([BURGLARY, NOISE])).not.toContain("…and");
  });
});

describe("the trend line", () => {
  it("says nothing at all when there is no preceding window", () => {
    /*
      The load-bearing one. `previousCount` is omitted for a village activated
      this week, and "up 2 reports on the week before (0)" would state a rise
      that is an artefact of the village's age — in a post to the whole
      internet.
    */
    const text = post([BURGLARY, NOISE]);

    expect(text).toContain("📊 2 reports this week.");
    expect(text).not.toContain("week before");
    expect(text).not.toContain("Up ");
    expect(text).not.toContain("Down ");
  });

  it("reports a rise, a fall and no change against a real baseline", () => {
    expect(post([BURGLARY, NOISE], { previousCount: 1 })).toContain(
      "Up 1 report on the week before (1).",
    );
    expect(post([BURGLARY], { previousCount: 4 })).toContain(
      "Down 3 reports on the week before (4).",
    );
    expect(post([BURGLARY], { previousCount: 1 })).toContain(
      "Same as the week before (1 report).",
    );
  });

  it("says nothing about a percentage", () => {
    // One report to two is "up 100%", which is true and useless — and at
    // village scale every percentage here is that.
    expect(post([BURGLARY, NOISE], { previousCount: 1 })).not.toContain("%");
  });

  it("reports a fall to nothing without claiming a quiet week is a trend", () => {
    const text = post([], { previousCount: 3 });

    expect(text).toContain("📊 No reports this week.");
    expect(text).toContain("Down 3 reports on the week before (3).");
  });
});

describe("the join link", () => {
  it("carries the slug and the join code", () => {
    const text = post([BURGLARY]);

    expect(text).toContain(
      `${BASE}/join/histon-cambridgeshire?code=OAK7X2`,
    );
  });

  it("omits the code for a village that has never been activated", () => {
    const text = post([BURGLARY], { joinCode: null });

    expect(text).toContain(`${BASE}/join/histon-cambridgeshire`);
    expect(text).not.toContain("code=");
  });

  it("normalises a code that was typed in by hand", () => {
    expect(post([BURGLARY], { joinCode: " oak 7x2 " })).toContain("code=OAK7X2");
  });
});

describe("an empty week", () => {
  it("still produces a post, and says the week was quiet", () => {
    const text = post([]);

    expect(text).toContain("🛡️ This week in Histon");
    expect(text).toContain("Nothing was reported");
    expect(text).toContain("Join your village");
  });

  it("renders no incident lines", () => {
    expect(post([]).split("\n").filter((line) => line.includes(" — "))).toHaveLength(0);
  });
});
