import {
  ECOPS_MAX_ITEMS_PER_SYNC,
  ECOPS_RSS_URL,
  ECOPS_SUMMARY_MAX_CHARS,
  ECOPS_TIMEOUT_MS,
  ECOPS_USER_AGENT,
} from "@/lib/constants";

/**
 * The client for the Neighbourhood Alert ("eCops") RSS feed. **Server only.**
 *
 * Neighbourhood Alert is the messaging platform most UK forces and Neighbourhood
 * Watch schemes send their public bulletins through — Hampshire Alert,
 * Warwickshire Connected, Met Engage and about twenty more are all one site on
 * it. `GET /RSS` returns recent messages as RSS 2.0. No key, no account, no
 * quota.
 *
 * ## The contract
 *
 * The one `src/lib/police-api.ts` keeps and for the same reasons: **every
 * failure is a returned value, never a throw.** The only callers are a cron with
 * nobody in front of it and a dashboard panel that must not become an error page
 * because a third party is down.
 *
 * ## What the feed actually is — established against the live endpoint
 *
 * Three facts, each checked rather than assumed, and each of which decided
 * something below:
 *
 * - **There is no location.** An item carries a title, an HTML body, a
 *   publication date, a category, who sent it and a link. No coordinate, no
 *   postcode, no place name. This is why nothing here returns a `lat`/`lng` and
 *   why these alerts are not on the map — see `ECOPS_NO_LOCATION_NOTE`.
 * - **`SiteId` selects a portal**, not a neighbourhood. `SiteId=2` is
 *   Warwickshire Connected; `SiteId=0` (the default) is a national firehose of
 *   the last hundred messages from every force in the country, which is not
 *   useful to a village. `AreaId` returned an empty channel for every value
 *   tried inside a valid site, so **nothing here sends it** — a parameter that
 *   silently returns nothing is worse than one that is not sent.
 * - **An unknown site and a quiet site look identical.** Both answer `200` with
 *   a well-formed channel containing no items. There is no error to distinguish
 *   a mistyped `SiteId` from a force that has not posted this week, so the
 *   distinction has to be carried by the caller — `EcopsSiteSync` in
 *   `src/lib/ecops/alerts.ts` is where it lives, and `empty` is a recorded
 *   outcome rather than an absence of one.
 *
 * ## Why the parser is written here rather than installed
 *
 * No XML dependency. The feed is RSS 2.0 with nine elements per item and no
 * namespaces, and the codebase already prefers a small parser it controls to a
 * general one it does not — `src/lib/markdown.ts` exists for exactly that
 * reason. `parseEcopsFeed` is exported so the shapes that actually break it are
 * unit-testable without a network call.
 */

// ---------------------------------------------------------------------------
// The contract
// ---------------------------------------------------------------------------

export type EcopsFailureCode =
  | "timeout"
  | "network"
  /** A 200 whose body is not RSS we can read. */
  | "invalid_output"
  /** Any non-2xx. */
  | "upstream";

export type EcopsResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: EcopsFailureCode; message: string };

function fail<T>(code: EcopsFailureCode, message: string): EcopsResult<T> {
  return { ok: false, code, message };
}

/** One message, already narrowed and already plain text. */
export type EcopsAlertItem = {
  /** The feed's own numeric id. Stable, and the dedupe key. */
  externalId: string;
  title: string;
  /**
   * An excerpt of the body as text, never markup.
   *
   * Capped at `ECOPS_SUMMARY_MAX_CHARS` — a copyright decision rather than a
   * layout one, since this feed carries no open licence. See the constant.
   */
  summary: string;
  category: string | null;
  /** "The Police" or "Neighbourhood Watch", as the feed spells it. */
  sentBy: string | null;
  /**
   * The named officer or coordinator who sent it, e.g.
   * "Tracy Bell (Police, PCSO Supervisor, North East)".
   *
   * A public official's byline on a public bulletin — the same category as the
   * neighbourhood team names `police-api.ts` already stores, and not a
   * resident's data. It is the answer to "who do I reply to", which is most of
   * why a coordinator reads one of these.
   */
  senderName: string | null;
  /** The force's own page for this message. `http(s)` only, or null. */
  link: string | null;
  publishedAt: Date;
};

export type EcopsFeed = {
  items: EcopsAlertItem[];
  /**
   * Items the parser refused — no id, no title, or an unreadable date.
   *
   * Surfaced rather than swallowed, on `PoliceStreetCrimes.dropped`'s
   * reasoning: one bad item in somebody else's feed is not worth losing the
   * fetch over, and a *rising* count is the shape of an upstream change that
   * nothing else would show.
   */
  dropped: number;
  /** True where `ECOPS_MAX_ITEMS_PER_SYNC` cut the list short. */
  truncated: boolean;
};

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

/**
 * One site's recent messages.
 *
 * `siteId` is required by this function though the API defaults it to 0,
 * because 0 is the national feed and storing that against a village would be
 * filing Cornwall's notices under a Cambridgeshire parish. A caller that wants
 * the firehose has to ask for it by number.
 *
 * `AreaId` and `Ip` are deliberately not sent. See the header.
 */
export async function fetchEcopsAlerts(input: {
  siteId: number;
}): Promise<EcopsResult<EcopsFeed>> {
  const query = new URLSearchParams({ SiteId: String(input.siteId) });
  const url = `${ECOPS_RSS_URL}?${query.toString()}`;

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/rss+xml, text/xml, application/xml",
        // An open feed with no key has no other way to tell one caller from
        // another. Same reasoning as `POLICE_API_USER_AGENT`.
        "User-Agent": ECOPS_USER_AGENT,
      },
      signal: AbortSignal.timeout(ECOPS_TIMEOUT_MS),
      // Never Next's fetch cache: this is a large document already cached in
      // Postgres by the sync, and a build-time entry for it would be a stale
      // bulletin nobody can invalidate.
      cache: "no-store",
    });
  } catch (cause) {
    const timedOut =
      cause instanceof DOMException && cause.name === "TimeoutError";

    return fail(
      timedOut ? "timeout" : "network",
      timedOut
        ? `Neighbourhood Alert did not answer within ${Math.round(
            ECOPS_TIMEOUT_MS / 1000,
          )}s`
        : `Could not reach Neighbourhood Alert: ${
            cause instanceof Error ? cause.message : "unknown error"
          }`,
    );
  }

  if (!response.ok) {
    return fail("upstream", `Neighbourhood Alert returned ${response.status}`);
  }

  let body: string;

  try {
    body = await response.text();
  } catch {
    return fail("network", "Neighbourhood Alert's response could not be read");
  }

  return parseEcopsFeed(body);
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

/**
 * RSS 2.0 to items. Exported for the tests; nothing else should call it.
 *
 * Deliberately tolerant in one direction and strict in the other. It accepts
 * anything shaped like the feed — attributes split across lines, a byte-order
 * mark, CDATA, elements in any order, elements absent — and refuses an item
 * that cannot be identified or dated, because a row with no stable id cannot be
 * de-duplicated and a row with no date cannot be ordered.
 */
export function parseEcopsFeed(xml: string): EcopsResult<EcopsFeed> {
  // The live feed opens with a UTF-8 BOM, which is not a parse failure but does
  // sit in front of the declaration.
  const body = xml.replace(/^﻿/, "");

  if (!/<rss[\s>]/i.test(body) && !/<channel[\s>]/i.test(body)) {
    return fail(
      "invalid_output",
      "Neighbourhood Alert returned something that is not an RSS feed",
    );
  }

  const blocks = body.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];

  const items: EcopsAlertItem[] = [];
  let dropped = 0;
  let truncated = false;

  for (const block of blocks) {
    if (items.length >= ECOPS_MAX_ITEMS_PER_SYNC) {
      truncated = true;
      break;
    }

    const item = readItem(block);

    if (!item) {
      dropped += 1;
      continue;
    }

    items.push(item);
  }

  // Newest first — the order every caller wants, sorted rather than trusted.
  // The feed happens to arrive that way and "happens to" is not a contract.
  items.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());

  return { ok: true, data: { items, dropped, truncated } };
}

/** One `<item>` block, or null where it cannot be identified or dated. */
function readItem(block: string): EcopsAlertItem | null {
  // `id` and `guid` carry the same number in every item seen; `guid` is the RSS
  // standard one and `id` is this feed's addition, so either will do and both
  // are tried. `guid` arrives with an `isPermaLink` attribute, sometimes on its
  // own line — `element()` allows for that.
  const externalId = (element(block, "id") || element(block, "guid")).trim();

  if (!externalId) return null;

  const title = toPlainText(element(block, "title"));

  if (!title) return null;

  const published = new Date(element(block, "pubDate").trim());

  if (Number.isNaN(published.getTime())) return null;

  return {
    externalId,
    title,
    summary: truncate(
      toPlainText(element(block, "description")),
      ECOPS_SUMMARY_MAX_CHARS,
    ),
    category: toPlainText(element(block, "category")) || null,
    sentBy: toPlainText(element(block, "sentby")) || null,
    senderName: toPlainText(element(block, "sendername")) || null,
    link: safeHttpUrl(element(block, "link")),
    publishedAt: published,
  };
}

/**
 * The text of one child element, or `""`.
 *
 * `(?:\s[^>]*)?` is what makes `<guid isPermaLink="false">` work, and the real
 * feed puts that attribute on the following line — so the class has to admit
 * newlines, which `[^>]` does.
 */
function element(block: string, name: string): string {
  const pattern = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`,
    "i",
  );

  return block.match(pattern)?.[1] ?? "";
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(value: string): string {
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (match, entity: string) => {
      const token = entity.toLowerCase();

      if (token.startsWith("#x")) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isFinite(code) ? safeFromCodePoint(code, match) : match;
      }

      if (token.startsWith("#")) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? safeFromCodePoint(code, match) : match;
      }

      return NAMED_ENTITIES[token] ?? match;
    },
  );
}

/** `String.fromCodePoint` throws on anything outside Unicode; it must not. */
function safeFromCodePoint(code: number, fallback: string): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return fallback;
  }
}

/**
 * A feed field as text, never markup.
 *
 * The bodies are **double-encoded**: an HTML document, entity-escaped so it can
 * travel inside an XML element. So `&lt;p&gt;` is a paragraph tag and
 * `&amp;nbsp;` is a space, and both need unwrapping before there is anything
 * worth stripping.
 *
 * **Decoding happens before stripping, and twice, and the order is the point.**
 * Strip first and the tags are still `&lt;p&gt;` and survive untouched. Decode
 * once and strip and a body written as `&amp;lt;script&amp;gt;` unwraps to
 * `&lt;script&gt;` behind the stripper's back and arrives as a literal
 * `<script>` in the summary. Decoding to a fixed point first means anything
 * tag-shaped at any depth is tag-shaped when the stripper runs.
 *
 * That is defence in depth rather than the defence: nothing renders this as
 * HTML — React escapes text, and the codebase's one `dangerouslySetInnerHTML`
 * is over a string it builds itself. Like `police-api.ts`'s `stripTags` this
 * removes tags rather than deciding which are safe, so there is no allow-list
 * to get wrong.
 */
export function toPlainText(value: string | null | undefined): string {
  if (!value) return "";

  // CDATA is not used by this feed today and is ordinary in RSS. Unwrapped
  // rather than left for the entity pass, which would not touch it.
  let text = value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

  // Two passes reaches a fixed point for the double-encoding above. Bounded
  // rather than looped to stability: a crafted body of `&amp;amp;amp;…` should
  // cost two passes, not as many as it asked for.
  text = decodeEntities(decodeEntities(text));

  return stripMergeTokens(text.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Removes the alert platform's unsubstituted mail-merge placeholders.
 *
 * **Measured, not anticipated.** The bodies are written against a personalised
 * template, and the RSS copy is the pre-substitution one — `{FIRST_NAME}`
 * appears in 125 of the 200 messages on one force's feed, and in 499 items
 * across the six feeds sampled while this was written. It is the normal shape
 * of a message on this platform rather than an edge case.
 *
 * **The salutation goes with the token, and that is the whole reason this is
 * two expressions.** Dropping `{FIRST_NAME}` on its own turns
 * `"Dear {FIRST_NAME} Appeal for Information"` into `"Dear Appeal for
 * Information"` — which is worse than leaving the placeholder, because it reads
 * as a sentence addressed to "Appeal" rather than as something obviously
 * missing. So a salutation immediately in front of a token is removed with it,
 * and any token elsewhere is removed on its own.
 *
 * The class is deliberately narrow — upper case, digits and underscores inside
 * braces — so ordinary prose that happens to contain braces is left alone.
 */
function stripMergeTokens(value: string): string {
  return value
    .replace(/\b(?:dear|hello|hi)\s+\{[A-Z_][A-Z_0-9]*\}\s*[,.!]?/gi, " ")
    .replace(/\{[A-Z_][A-Z_0-9]*\}/g, " ");
}

/**
 * An excerpt, cut at a word boundary.
 *
 * The ellipsis is doing real work: it is what tells a reader the message
 * continues, which is what makes the link to the force's page the obvious next
 * move rather than a decoration.
 */
function truncate(value: string, max: number): string {
  if (value.length <= max) return value;

  const cut = value.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");

  // A body with no space in the first `max` characters is not prose; cutting at
  // the limit is better than returning the whole of it.
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * A link from the feed, or null.
 *
 * The same guard `police-api.ts` puts in front of a force's CMS URL and
 * `getVillageChannel` puts in front of a stored channel link, and it is needed
 * here for a sharper reason than either: these end up in an `href` on a
 * coordinator's dashboard, they came out of somebody else's system, and there
 * are two dozen different portals publishing into one feed — so there is no
 * single host to check against and `http(s)`-only is the whole of the check.
 * A message with an unusable link renders without one rather than with a broken
 * or dangerous one.
 */
function safeHttpUrl(value: string | null | undefined): string | null {
  const trimmed = decodeEntities(value?.trim() ?? "").trim();

  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}
