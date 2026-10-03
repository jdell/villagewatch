import { describe, expect, it } from "vitest";
import { NOTIFICATION_RADII } from "@/lib/constants";
import { daysSince, initials, RADIUS_STOPS, radiusStop } from "@/lib/you";
import {
  notificationSettingsSchema,
  profileSettingsSchema,
} from "@/lib/validations";

/**
 * "You" — the avatar's letters, the profile card's days, the radius slider's
 * stops, and the two halves of the settings form. The last is the one that
 * matters: each sub-page posts its own form, and a post naming `role`,
 * `villageId` or `verifiedAt` must parse to an object without them (domain
 * rule 5).
 */

describe("initials", () => {
  it("takes the first and last words' first letters", () => {
    expect(initials("Joel Dell")).toBe("JD");
    expect(initials("Mary Anne de la Cruz")).toBe("MC");
    expect(initials("  cher  ")).toBe("C");
  });

  it("is a question mark with nothing to take", () => {
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
    expect(initials("  123 !! ")).toBe("?");
  });

  it("keeps a letter outside the basic plane whole", () => {
    expect(initials("𝒜da Lovelace")).toBe("𝒜L");
    expect(initials("Éowyn Ångström")).toBe("ÉÅ");
  });
});

describe("daysSince", () => {
  const now = new Date(Date.UTC(2026, 9, 4, 12));

  it("counts the joining day as day one", () => {
    expect(daysSince(new Date(Date.UTC(2026, 9, 4, 9)), now)).toBe(1);
    expect(daysSince(new Date(Date.UTC(2026, 9, 3, 12)), now)).toBe(2);
  });

  it("is never below one, even for a clock running behind", () => {
    expect(daysSince(new Date(Date.UTC(2026, 9, 5)), now)).toBe(1);
  });
});

describe("the radius slider", () => {
  it("runs outwards and ends at the whole village", () => {
    const metres = RADIUS_STOPS.map((stop) => stop.value);
    expect(metres.at(-1)).toBeNull();
    const finite = metres.slice(0, -1) as number[];
    expect(finite).toEqual([...finite].sort((a, b) => a - b));
    expect(RADIUS_STOPS).toHaveLength(NOTIFICATION_RADII.length);
  });

  it("finds a stored radius and reads anything else as the village", () => {
    expect(RADIUS_STOPS[radiusStop(500)].value).toBe(500);
    expect(RADIUS_STOPS[radiusStop(null)].value).toBeNull();
    expect(RADIUS_STOPS[radiusStop(321)].value).toBeNull();
  });
});

describe("the two settings forms", () => {
  it("drops role, village and verification from a profile post", () => {
    const parsed = profileSettingsSchema.parse({
      fullName: "Joel Dell",
      addressLine: "Oak Lane",
      role: "COORDINATOR",
      villageId: "someone-elses",
      verifiedAt: "2026-01-01",
    });

    expect(parsed).toEqual({ fullName: "Joel Dell", addressLine: "Oak Lane" });
  });

  it("drops them from a notifications post too, and reads an absent switch as off", () => {
    const parsed = notificationSettingsSchema.parse({
      notifyPush: "",
      notifyEmail: "on",
      notifyMinSeverity: "HIGH",
      notifyRadiusMeters: "200",
      role: "ADMIN",
      fullName: "Somebody Else",
    });

    expect(parsed).toEqual({
      notifyPush: false,
      notifyEmail: true,
      notifyMinSeverity: "HIGH",
      notifyRadiusMeters: 200,
    });
  });

  it("refuses a radius that is not one of the stops", () => {
    expect(
      notificationSettingsSchema.safeParse({
        notifyMinSeverity: "LOW",
        notifyRadiusMeters: "321",
      }).success,
    ).toBe(false);
  });
});
