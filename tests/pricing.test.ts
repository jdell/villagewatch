import { describe, expect, it } from "vitest";

import { PRICING } from "@/lib/constants";
import { landingStructuredData } from "@/lib/structured-data";

/**
 * The landing page's pricing section, asserted as a set of promises rather than
 * as copy.
 *
 * **No wording is asserted here on purpose.** The two feature lists are marketing
 * text under revision, and a test that failed whenever somebody improved a
 * sentence teaches people to edit the assertion — the reasoning
 * `compliance-documents.test.ts` already gives for the three legal documents.
 * What is pinned is the thing that cannot be allowed to drift: **a tier a reader
 * cannot buy must not state a price**, on the page or in the structured data.
 *
 * `featured` is the availability flag. It is what picks "Available now" over
 * "Planned" on the card, what picks the tick over the dashed marker beside each
 * feature, and what decides whether the "none of this is built yet" heading
 * renders. The whole failure this section was carrying — a price and six ticks
 * against a plan with no billing behind it — is a `featured: false` tier
 * dressed as a `featured: true` one, so that is what these tests read.
 */

const availableTiers = PRICING.filter((tier) => tier.featured);
const plannedTiers = PRICING.filter((tier) => !tier.featured);

describe("PRICING", () => {
  it("has at least one tier of each kind, or the rest of this file asserts nothing", () => {
    expect(availableTiers.length).toBeGreaterThan(0);
    expect(plannedTiers.length).toBeGreaterThan(0);
  });

  it("states no price against a tier that is only planned", () => {
    for (const tier of plannedTiers) {
      expect(tier.price, `${tier.name} states a price`).toBeUndefined();
    }
  });

  it("states no cadence against a tier that is only planned", () => {
    // A period on its own reads as a subscription with the number missing,
    // which is worse than either stating a figure or stating nothing.
    for (const tier of plannedTiers) {
      expect(tier.cadence, `${tier.name} states a cadence`).toBeUndefined();
    }
  });

  it("never carries a cadence without the price it qualifies", () => {
    for (const tier of PRICING) {
      if (tier.cadence) {
        expect(tier.price, `${tier.name} has a cadence and no price`).toBeTruthy();
      }
    }
  });

  it("gives every tier something to show under the heading", () => {
    for (const tier of PRICING) {
      expect(tier.features.length).toBeGreaterThan(0);
      for (const feature of tier.features) {
        expect(feature.trim()).not.toBe("");
      }
    }
  });
});

describe("landing structured data", () => {
  /**
   * The half of this that machines read.
   *
   * A price removed from the card and left in the JSON-LD would be worse than
   * leaving it on the card: structured data is shown to people who never open
   * the page, so nothing around it can correct it.
   */
  const application = landingStructuredData("https://villagewatch.example")[
    "@graph"
  ].find((node) => node["@type"] === "SoftwareApplication") as
    | { offers?: { price: number; description: string } }
    | undefined;

  it("describes the application", () => {
    expect(application).toBeDefined();
  });

  it("offers only a tier somebody can actually take up", () => {
    const offered = application?.offers;
    if (!offered) return; // No offer at all is the documented safe failure.

    expect(offered.price).toBe(0);
    expect(plannedTiers.map((tier) => tier.name)).not.toContain(
      offered.description,
    );
  });
});
