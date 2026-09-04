import type { IncidentType, Severity } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import {
  PUBLIC_INCIDENT_STATUSES,
  PUBLIC_PREVIEW_DESCRIPTION_CHARS,
} from "@/lib/constants";
import { truncateWords } from "@/lib/format-alert";

/**
 * The reads behind `/incident/[id]` and the two public API routes beside it.
 *
 * Server only. This is the only place in the codebase that returns an incident
 * to somebody with **no session at all**, which is why it is its own module
 * rather than a wider `select` on an existing one: everything it does not
 * return is the point, and a shared constant would invite a field being added
 * for one caller and leaking through this one.
 *
 * ## What it deliberately does not return
 *
 * `PUBLIC_INCIDENT_SELECT` is "public" in the sense of *inside the village* —
 * it omits `rawDescription` and nothing else, because every caller of it is
 * already behind `requireSession()` and scoped to one village (domain rule 4).
 * This page has neither of those, so the bar is different and higher. Absent
 * from the type below, and absent from the `select`:
 *
 *   - `locationText` — the free-text landmark, e.g. "the lane behind the
 *     village hall". The single most re-identifying column on the row: a
 *     landmark, a category and a date is enough for a neighbour to work out
 *     whose house it was.
 *   - `lat`/`lng` — jittered (domain rule 2), which makes them safe on a
 *     village map and no safer than the landmark out here.
 *   - `reference` — carries this village's own count for the year
 *     (`VW-HIS-2026-0003`), so it is a volume figure in disguise.
 *   - `patternNote` — a sentence naming a radius and a count. The *fact* of a
 *     pattern is returned; the sentence describing it is not.
 *   - `title` — resident-written and untouched by the AI pass, so it is the one
 *     free-text column on the row with no anonymisation behind it at all.
 *
 * ## The description, which is the one that took a decision
 *
 * `description` **is** returned, truncated to
 * `PUBLIC_PREVIEW_DESCRIPTION_CHARS`. It is the AI-anonymised rewrite — the
 * column the village map and the incident list already render — and a
 * coordinator can already paste a longer extract of the very same column onto a
 * public WhatsApp Channel or a Facebook post, which `/privacy` §6 has described
 * since those buttons were built. So the extract is not a new *kind* of
 * disclosure; what is new is that it happens without a coordinator deciding
 * each time, which is why it is a first line rather than the alert's 240
 * characters.
 *
 * The caveat worth carrying to any future change here: where the AI pass never
 * ran — no key, a timeout, a reporter who declined the rewrite — `description`
 * holds the reporter's own wording. `Incident.anonymized` records which, and it
 * is deliberately **not** used to gate this: that text is already on the
 * village map and already goes out in a pasted alert, so gating here would
 * imply a protection the rest of the app does not provide. Lengthening the
 * extract is the change that would make that matter.
 *
 * ## Two guards that are not obvious from the call site
 *
 * `PUBLIC_INCIDENT_STATUSES` narrows to `PUBLISHED` and `RESOLVED` — a draft, a
 * report awaiting review, a rejected one and a tombstone are all absent
 * (domain rule 6), and out here that matters more than anywhere else in the
 * app, because there is nobody to have got it wrong in front of.
 *
 * The village must be `ACTIVE`. A `PENDING` directory entry has no residents
 * and no coordinator, so its "Register" button would send somebody to a village
 * that cannot accept them — and a marketing page for a village nobody runs is
 * worse than a 404.
 */

/** Fields safe to render to somebody with no account. See the module header. */
export type PublicIncidentPreview = {
  id: string;
  type: IncidentType;
  severity: Severity;
  /** When it happened. Rendered as a date and a relative age, never a time. */
  occurredAt: Date;
  /** Whether it matched others nearby — the *fact*, never `patternNote`. */
  recurring: boolean;
  /**
   * The first line of the anonymised description, on a word boundary, with an
   * ellipsis where it was cut. Never the whole column.
   */
  descriptionExtract: string;
  /** True where the AI pass rewrote the description. See the module header. */
  anonymized: boolean;
  village: {
    /** Passed to `/register` as a prefill, the way `/join/[slug]` does it. */
    id: string;
    name: string;
    region: string | null;
  };
};

/**
 * The figures behind "… incidents recorded by … residents across … villages".
 *
 * Deployment-wide rather than per village, which is what makes it a reason to
 * join rather than a statistic about one parish. Every one of the three is a
 * real `count(*)` — there is no floor, no rounding and no "over 1,000". The
 * landing page keeps `VILLAGES_LIVE` at null precisely so it never prints a
 * figure nobody can point at; this counter is the version of that number that
 * is allowed to exist, because it is computed rather than typed in.
 */
export type CommunityStats = {
  /** Published and resolved reports, across every active village. */
  incidents: number;
  /** Open accounts belonging to an active village. */
  residents: number;
  /** Villages actually running — never the seeded `PENDING` directory. */
  villages: number;
};

/**
 * Postgres rejects a malformed UUID rather than returning no rows, so an id
 * out of a mistyped link would surface as a 500 on a public page. The column is
 * `@db.Uuid`; this is the cheap shape check that turns that into a 404.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The teaser for one report, or null if there is nothing to show.
 *
 * Null covers every reason equally — no such id, not published, village not
 * active, no database configured, query failed — because the page renders
 * `notFound()` for all of them and the caller has no business telling them
 * apart. Distinguishing them on screen would confirm that an id exists to
 * somebody holding a link they should not have.
 *
 * It never throws. This runs on a page that arrives by way of a link pasted
 * into WhatsApp, so the failure that matters is an error page in front of
 * somebody who has never heard of VillageWatch.
 */
export async function getPublicIncidentPreview(
  id: string,
): Promise<PublicIncidentPreview | null> {
  if (!UUID.test(id) || !process.env.DATABASE_URL) return null;

  try {
    const incident = await prisma.incident.findFirst({
      where: {
        id,
        status: { in: [...PUBLIC_INCIDENT_STATUSES] },
        village: { status: "ACTIVE" },
      },
      select: {
        id: true,
        type: true,
        severity: true,
        occurredAt: true,
        recurring: true,
        description: true,
        anonymized: true,
        village: { select: { id: true, name: true, region: true } },
      },
    });

    if (!incident) return null;

    const { description, ...rest } = incident;

    return {
      ...rest,
      /**
       * Truncated here rather than at the two call sites, so the whole column
       * never crosses out of this module. A page or a route handler that had
       * the full string and trimmed it for display would still have sent it —
       * to the browser, and to every link-preview crawler that fetches the page.
       */
      descriptionExtract: truncateWords(
        description,
        PUBLIC_PREVIEW_DESCRIPTION_CHARS,
      ),
    };
  } catch (error) {
    console.error("[public-incident] preview lookup failed", error);
    return null;
  }
}

/**
 * The three community counters, or null if they cannot be read.
 *
 * Null rather than zeroes on failure, and the distinction is the point: "0
 * incidents recorded by 0 residents" is a sentence about a service nobody uses,
 * and a database blip should not put it on a public page. The callers render
 * nothing at all instead.
 *
 * Scoped to `ACTIVE` villages throughout. The directory holds 270 seeded
 * Cambridgeshire parishes at `PENDING` with nobody in them, and counting those
 * would turn this line into the made-up figure `VILLAGES_LIVE` exists to
 * refuse.
 */
export async function getCommunityStats(): Promise<CommunityStats | null> {
  if (!process.env.DATABASE_URL) return null;

  try {
    const [incidents, residents, villages] = await Promise.all([
      prisma.incident.count({
        where: {
          status: { in: [...PUBLIC_INCIDENT_STATUSES] },
          village: { status: "ACTIVE" },
        },
      }),
      /**
       * `eraseAccount` nulls `villageId` as well as `deletedAt`, so a closed
       * account has already left the villages this counts over. `deletedAt` is
       * checked anyway, as a backstop for a row closed some other way — the
       * same belt-and-braces `listVillageResidents` uses.
       */
      prisma.user.count({
        where: { deletedAt: null, village: { status: "ACTIVE" } },
      }),
      prisma.village.count({ where: { status: "ACTIVE" } }),
    ]);

    return { incidents, residents, villages };
  } catch (error) {
    console.error("[public-incident] stats lookup failed", error);
    return null;
  }
}

/**
 * The path a preview lives at.
 *
 * `/incident`, singular, and **not** `/incidents/[id]`, which is the
 * authenticated detail page and is in `PROTECTED_ROUTES`. Two reasons it could
 * not simply be made public in place: the proxy would have to learn an
 * exception to a denylist that is otherwise a straight prefix match, and the
 * page itself renders the full description, the landmark, the map pin, the
 * media and the vote buttons — everything this preview exists to withhold.
 *
 * Exported so that anything building a shareable link has one definition to
 * call rather than assembling the string. Note that `incidentUrl` in
 * `src/lib/format-alert.ts` still points at the authenticated page, which is
 * what a coordinator pasting a WhatsApp alert sends today; pointing it here
 * instead is a deliberate decision about what a village publishes, not a tidy-up.
 */
export function publicIncidentPath(id: string): string {
  return `/incident/${id}`;
}
