import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { buildJoinUrl } from "@/lib/invite";
import { formatDate } from "@/lib/format";
import {
  INCIDENT_TYPE_LABELS,
  SEVERITY_META,
  SOCIAL_POST_MAX_INCIDENTS,
} from "@/lib/constants";

/**
 * The village's week as a block of text a coordinator can paste into Facebook.
 *
 * **Safe to import from a Client Component**, and held to the same import
 * budget as `format-alert.ts` for the same reason: `constants.ts` (types only
 * from Prisma), `format.ts` (Intl) and `invite.ts` (which borrows
 * `appBaseUrl()` from `format-alert.ts`). No Prisma client, no `node:crypto`,
 * no environment secret. The route formats it and the button renders the same
 * string, so what is on screen is exactly what goes on the clipboard.
 *
 * ## This is the widest surface in the app, and it is shaped accordingly
 *
 * A WhatsApp Channel is public to anyone holding the invite link. A Facebook
 * post is public to anyone at all — indexed, forwarded, screenshotted, and not
 * recallable by deleting it. So this format is deliberately **narrower** than
 * `formatIncidentAlert`, which is itself narrower than the incident page:
 *
 * - **No description, in any form.** Not the anonymised column, not truncated,
 *   not a first line. That is the one real difference from the WhatsApp alert,
 *   and it is the whole privacy argument for this format: `description` is only
 *   *usually* the AI rewrite — when the pass did not run it holds the
 *   reporter's own wording, names and registrations included (see The AI pass).
 *   The WhatsApp panel manages that risk by warning the coordinator and
 *   trusting them to read it; a weekly digest is a dozen reports at once, so
 *   the same trust would mean reading a dozen and catching the one. A type and
 *   a landmark carry the warning a neighbour needs without ever putting a
 *   resident's sentence in front of the open internet.
 * - **No title either**, for the same reason and less obviously. `Incident.title`
 *   is not rewritten by the AI pass in the way the description is — it is
 *   reporter-authored text with no anonymisation guarantee behind it at all.
 * - **No link to any individual report.** `formatIncidentAlert` carries one
 *   because a coordinator pasting a single alert has read that report; a digest
 *   line is one of twelve and the link would be an invitation to a page that
 *   says considerably more than the line above it.
 * - **`SocialIncident` has no field that could carry `rawDescription`, `lat`,
 *   `lng`, `title` or `description`.** The structural guard `AlertIncident`,
 *   `ReportIncident`, `ExportIncident` and `IncidentEmailInput` all use, and
 *   here in its sharpest form — this is the only format in the codebase whose
 *   audience is the entire internet.
 *
 * What is left is what a neighbour can act on: how serious, what kind of thing,
 * and roughly where.
 *
 * ## The severity emoji come from `SEVERITY_META`
 *
 * There are **four** severities and the emoji are 🟢 🟠 🔴 🟣. A second
 * severity-to-emoji map local to this file would mean a MEDIUM report reading
 * one way in a Facebook post and another on a lock screen, and CRITICAL — the
 * level whose description is "danger to life or property, call 999 first" —
 * having no glyph at all.
 */

/**
 * One published report, as a digest line.
 *
 * Every field here is already public on the village map. There is no field for
 * the reporter's wording, the title or the coordinates — see the header.
 */
export type SocialIncident = {
  type: IncidentType;
  severity: Severity;
  /** The anonymised landmark. Null for a report filed without one. */
  locationText: string | null;
};

export type SocialPostInput = {
  villageName: string;
  /** `Village.slug`, for the join link. */
  villageSlug: string;
  /** `Village.joinCode`, so a scanned link lands on a form that can be finished. */
  joinCode?: string | null;
  /** Published reports in the window, newest first. */
  incidents: readonly SocialIncident[];
  /** Inclusive start of the window. */
  windowStart: Date | string | number;
  /** Inclusive end of the window. */
  windowEnd: Date | string | number;
  /**
   * Published reports over the preceding window of equal length, for the trend
   * line. Omitted means "say nothing about the trend" rather than "zero" — a
   * village too new to have a preceding week must not be told it is up 100%.
   */
  previousCount?: number;
  /** Overridable for a test; defaults to this deployment's origin. */
  baseUrl?: string;
};

/**
 * "22 – 29 July 2026", collapsing a shared month and year.
 *
 * `formatDate` twice would give "22 July 2026 – 29 July 2026", which reads as
 * two dates rather than a range. Everything is in `Europe/London` because
 * `formatDate` is, and this is a sentence a person reads rather than a value
 * anything parses back.
 */
function formatWindow(
  start: Date | string | number,
  end: Date | string | number,
): string {
  const from = formatDate(start);
  const to = formatDate(end);

  if (!from || !to) return from || to;
  if (from === to) return from;

  const fromParts = from.split(" ");
  const toParts = to.split(" ");

  // Same month and year: "22 – 29 July 2026".
  if (fromParts[1] === toParts[1] && fromParts[2] === toParts[2]) {
    return `${fromParts[0]} – ${to}`;
  }

  // Same year only: "29 July – 4 August 2026".
  if (fromParts[2] === toParts[2]) {
    return `${fromParts[0]} ${fromParts[1]} – ${to}`;
  }

  return `${from} – ${to}`;
}

/** "1 report" / "4 reports" — the count is in the heading and again in the stats. */
function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}

/**
 * The trend sentence, or nothing.
 *
 * Nothing is the important half. `previousCount` is optional and an omitted one
 * means the caller has no preceding window to compare against — a village
 * activated this week. Rendering "up from 0" there would state a rise that is
 * an artefact of the village's age, in a post to the whole internet, and it is
 * exactly the shape of claim `severity-context.ts` refuses to make about a
 * young village.
 */
function trendLine(count: number, previous: number | undefined): string | null {
  if (previous === undefined) return null;

  const change = count - previous;

  if (change === 0) {
    return `Same as the week before (${plural(previous, "report")}).`;
  }

  // Written as a count rather than a percentage. One report to two is "up
  // 100%", which is true and useless, and at village scale every percentage
  // here is that.
  return change > 0
    ? `Up ${plural(change, "report")} on the week before (${previous}).`
    : `Down ${plural(-change, "report")} on the week before (${previous}).`;
}

/**
 * One digest line: severity, kind of thing, and roughly where.
 *
 * ```
 * 🔴 Burglary — Church Row
 * 🟠 Vehicle crime — location not given
 * ```
 *
 * A report filed without a landmark says so rather than being dropped. It
 * happened and it counts, and a silently shorter list under a heading that
 * gives the real total is a post that does not add up.
 */
function incidentLine(incident: SocialIncident): string {
  const place = incident.locationText?.trim();

  return [
    SEVERITY_META[incident.severity].emoji,
    " ",
    INCIDENT_TYPE_LABELS[incident.type],
    " — ",
    place && place.length > 0 ? place : "location not given",
  ].join("");
}

/**
 * The week's published reports as a Facebook-ready post.
 *
 * ```
 * 🛡️ This week in Histon
 * 22 – 29 July 2026 · 3 reports
 *
 * 🔴 Burglary — Church Row
 * 🟠 Vehicle crime — The Green, near the bus shelter
 * 🟢 Antisocial behaviour — Recreation ground
 *
 * 📊 3 reports this week. Up 1 report on the week before (2).
 *
 * 👀 Neighbours in Histon report what they see and everyone gets told.
 * Join your village: https://villagewatch.app/join/histon-cambridgeshire?code=OAK7X2
 *
 * ⚠️ In an emergency always call 999. For non-urgent police matters call 101.
 * VillageWatch is not an emergency service and reports here do not reach the police.
 * ```
 *
 * **The disclaimer is last and is not optional.** A public post listing
 * burglaries reads, to somebody who has not met the service, as a way of
 * telling the police about one — and the one failure mode this format could
 * have that matters is a neighbour reporting a break-in here instead of
 * dialling 999. It is the same reasoning `/incidents/new` renders the 999 and
 * 101 numbers on a screen a resident cannot file from.
 *
 * A week with nothing in it still produces a post, and says so. "Nothing
 * reported this week" is the most reassuring thing a village noticeboard can
 * say, and a coordinator who posts weekly should not go quiet in a good week —
 * going quiet is what makes the next post look like news.
 */
export function formatSocialPost(input: SocialPostInput): string {
  const {
    villageName,
    villageSlug,
    joinCode,
    incidents,
    windowStart,
    windowEnd,
    previousCount,
    baseUrl,
  } = input;

  const total = incidents.length;
  const window = formatWindow(windowStart, windowEnd);

  const heading = [
    `🛡️ This week in ${villageName.trim()}`,
    window
      ? `${window} · ${total === 0 ? "no reports" : plural(total, "report")}`
      : total === 0
        ? "No reports"
        : plural(total, "report"),
  ];

  const body: string[] = [];

  if (total === 0) {
    body.push(
      "",
      "✅ Nothing was reported in the village this week. A quiet week is worth saying out loud.",
    );
  } else {
    // Highest severity first, so the line a neighbour has to read is the first
    // one — a post read on a phone in a feed is read from the top and abandoned
    // partway down. `weight` is `SEVERITY_META`'s own ranking; ties keep the
    // caller's order, which is newest first.
    const ranked = [...incidents].sort(
      (a, b) => SEVERITY_META[b.severity].weight - SEVERITY_META[a.severity].weight,
    );

    const shown = ranked.slice(0, SOCIAL_POST_MAX_INCIDENTS);

    body.push("", ...shown.map(incidentLine));

    // Said rather than silently truncated, for the same reason the police sync
    // reports a capped run: a list quietly shorter than the count above it
    // looks like a village with less happening in it.
    if (ranked.length > shown.length) {
      body.push(`…and ${plural(ranked.length - shown.length, "more report")}.`);
    }
  }

  const stats = [
    `📊 ${total === 0 ? "No reports" : plural(total, "report")} this week.`,
    trendLine(total, previousCount),
  ]
    .filter((line): line is string => line !== null)
    .join(" ");

  const join = buildJoinUrl({ slug: villageSlug, joinCode, baseUrl });

  return [
    ...heading,
    ...body,
    "",
    stats,
    "",
    `👀 Neighbours in ${villageName.trim()} report what they see, and everyone gets told.`,
    `Join your village: ${join}`,
    "",
    "⚠️ In an emergency always call 999. For non-urgent police matters call 101.",
    "VillageWatch is not an emergency service and reports here do not reach the police.",
  ].join("\n");
}
