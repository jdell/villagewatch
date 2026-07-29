import type { MetadataRoute } from "next";
import { APP_ORIGIN, LEGAL_LAST_UPDATED } from "@/lib/constants";

/**
 * `/sitemap.xml` — the four pages a crawler is meant to find.
 *
 * ## Why it is a hand-written list rather than a query
 *
 * Because every other route in the app is one village's data behind a session.
 * There is no public content to enumerate: an incident is scoped by `villageId`
 * and gated by `requireSession()` (domain rule 4), and the village directory is
 * 10,670 parishes with nobody in them, seeded `PENDING` — listing those would
 * put ten thousand empty pages in front of a crawler and a parish name in front
 * of somebody who could then guess at its invite URL.
 *
 * The invite and join pages are deliberately absent for the sharper version of
 * that reason: they carry a join code in the query string, they are `noindex`
 * in their own metadata, and `robots.ts` disallows them. Three places say the
 * same thing because a crawled join code cannot be rotated back out of a search
 * cache.
 *
 * ## The dates
 *
 * `lastModified` on the two legal pages is `LEGAL_LAST_UPDATED`, the same
 * constant they print at the foot of the document, so a crawler is told what a
 * reader is told. It is deliberately **not** `new Date()`: a sitemap that
 * claims every page changed on every build is a sitemap a crawler learns to
 * ignore, and it would also make the output nondeterministic between two builds
 * of the same commit.
 *
 * The home page and the two auth screens carry no date at all rather than a
 * fabricated one — `lastModified` is optional, and omitting it says "no claim"
 * where a made-up date says something false.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? APP_ORIGIN;
  const legalUpdated = new Date(LEGAL_LAST_UPDATED);

  return [
    {
      url: `${origin}/`,
      changeFrequency: "monthly",
      priority: 1,
    },
    {
      url: `${origin}/register`,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${origin}/privacy`,
      lastModified: legalUpdated,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${origin}/terms`,
      lastModified: legalUpdated,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      // Below the legal pages on purpose. It is a door rather than a document —
      // worth being findable, not worth ranking for.
      url: `${origin}/login`,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
