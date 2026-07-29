import {
  APP_DESCRIPTION,
  APP_NAME,
  APP_ORIGIN,
  APP_TAGLINE,
  OPERATOR,
  PRICING,
} from "@/lib/constants";

/**
 * The schema.org description of the service, for the landing page.
 *
 * Three linked nodes rather than one: the company that publishes the site, the
 * site itself, and the software it serves. Search engines read them as separate
 * entities — an `Organization` can carry a logo and a support address into a
 * knowledge panel, and a `SoftwareApplication` is what earns a price and a
 * category — and `@id` cross-references are what stop them being read as three
 * unrelated things that happen to share a page.
 *
 * ## Everything here is a claim, and claims have to be true
 *
 * Structured data is read by machines and shown to people who never visit the
 * page, so a wrong figure here is worse than a wrong figure on screen: nobody
 * can see the context that would correct it. Two consequences run through this
 * file.
 *
 * **No `aggregateRating` and no `review`.** Nothing has been rated, and
 * inventing a rating is both a lie and a manual action from Google.
 *
 * **The price comes from `PRICING`**, and the Pro tier is deliberately absent —
 * it renders as "Planned" on the page and nothing takes payment (see "Not built
 * yet" in CLAUDE.md). An `Offer` for a plan that cannot be bought is a false
 * statement to a parish clerk comparing options.
 */

const ORGANIZATION_ID = `${APP_ORIGIN}/#organization`;
const WEBSITE_ID = `${APP_ORIGIN}/#website`;

/**
 * The free tier, which is the only one that can actually be taken up.
 *
 * Matched on the rendered string, because that is what `PricingTier.price` is —
 * it carries its own currency and period ("Free", "£15"), so there is no number
 * here to compare against. If a tier ever stops being called "Free" this finds
 * nothing and the `Offer` is omitted, which is the right way to be wrong: no
 * price in the structured data rather than a made-up one.
 */
const freeTier = PRICING.find((tier) => tier.price === "Free");

export function landingStructuredData(origin: string = APP_ORIGIN) {
  const organizationId = `${origin}/#organization`;
  const websiteId = `${origin}/#website`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": organizationId,
        name: OPERATOR.name,
        url: origin,
        email: OPERATOR.email,
        logo: {
          "@type": "ImageObject",
          url: `${origin}/android-chrome-512x512.png`,
          width: 512,
          height: 512,
        },
        // The company is registered in the UK and the product is British
        // English throughout — see "Open product questions" in CLAUDE.md.
        areaServed: { "@type": "Country", name: "United Kingdom" },
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          email: OPERATOR.email,
          availableLanguage: "English",
        },
      },
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: origin,
        name: APP_NAME,
        description: APP_DESCRIPTION,
        inLanguage: "en-GB",
        publisher: { "@id": organizationId },
      },
      {
        "@type": "SoftwareApplication",
        name: APP_NAME,
        alternateName: `${APP_NAME} — ${APP_TAGLINE}`,
        url: origin,
        description: APP_DESCRIPTION,
        // Both, because it is a Progressive Web App: installable from the
        // browser with no app store, which `public/manifest.json` is the other
        // half of.
        applicationCategory: "SecurityApplication",
        applicationSubCategory: "Community safety reporting",
        operatingSystem: "Web browser, iOS, Android",
        browserRequirements: "Requires JavaScript.",
        inLanguage: "en-GB",
        publisher: { "@id": organizationId },
        isPartOf: { "@id": websiteId },
        ...(freeTier
          ? {
              offers: {
                "@type": "Offer",
                price: 0,
                priceCurrency: "GBP",
                availability: "https://schema.org/InStock",
                description: freeTier.name,
              },
            }
          : {}),
      },
    ],
  };
}

/** Kept for callers that want the site-level ids without rebuilding them. */
export const STRUCTURED_DATA_IDS = {
  organization: ORGANIZATION_ID,
  website: WEBSITE_ID,
} as const;

/**
 * Serialises a JSON-LD node for a `<script type="application/ld+json">`.
 *
 * `<` is escaped even though nothing here is user input. A `</script>` inside a
 * JSON string would close the block and turn the rest of the document into
 * markup, and the day somebody interpolates a village name into this graph is
 * the day that stops being hypothetical. Cheaper to be right now than to
 * remember later.
 */
export function serialiseJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
