import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchEcopsAlerts,
  parseEcopsFeed,
  toPlainText,
} from "@/lib/ecops/fetch-alerts";
import {
  ECOPS_MAX_ITEMS_PER_SYNC,
  ECOPS_SUMMARY_MAX_CHARS,
  isPoliceSender,
} from "@/lib/constants";

/**
 * The Neighbourhood Alert ("eCops") client and its parser.
 *
 * `fetch` is stubbed, which is the whole boundary — this module has no key, no
 * database and no other dependency, so what is asserted is the thing that
 * actually matters about it: what it does with what somebody else's service
 * sends back.
 *
 * **The fixtures are the real feed's shapes, not invented ones**, which is why
 * a few of them look odd. The `guid` attribute really does sit on its own line.
 * The document really does open with a byte-order mark. The bodies really are
 * an HTML document entity-escaped so it can travel inside an XML element, and
 * they really do carry unsubstituted `{FIRST_NAME}` placeholders — 499 of them
 * across the six site feeds sampled when this was written, which is why that is
 * tested as a normal case rather than an edge one.
 *
 * Five properties, in the order they would hurt if they broke:
 *
 *   * **Nothing throws.** A timeout, a dead socket, a 500 and a body that is
 *     not RSS are all returned values with a code on them. The callers are a
 *     cron with nobody in front of it and a dashboard panel that must not
 *     become an error page because a third party is down.
 *   * **An empty channel is a success, not a failure.** This is the one that
 *     carries real weight. An unknown `SiteId`, a site that has published
 *     nothing, and a real site on a quiet week are *the same response* — 200
 *     with a well-formed, item-less channel. Reporting that as a failure would
 *     make `EcopsSiteSync` unable to record the distinction it exists for, and
 *     a coordinator who mistyped their site number would wait for ever.
 *   * **Nothing tag-shaped survives.** The bodies are double-encoded, so a
 *     stripper that ran before the decoder would leave the markup untouched and
 *     one that decoded only once would let `&amp;lt;script&amp;gt;` through as
 *     a literal `<script>`. Both orderings are asserted.
 *   * **One bad item costs that item.** A feed is a hundred elements published
 *     by somebody else; one without an id or a readable date should not cost
 *     the ninety-nine around it.
 *   * **A link is `http(s)` or it is nothing.** These end up in an `href` on a
 *     coordinator's dashboard, out of two dozen different content management
 *     systems, so there is no host to check against and the scheme is the whole
 *     check.
 */

const fetchMock = vi.fn();

function xml(body: string, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response;
}

/** An item in exactly the shape the live feed emits one. */
function item(overrides: Partial<Record<string, string>> = {}): string {
  const fields: Record<string, string> = {
    guid: "492310",
    link: "https://www.hampshirealert.co.uk/Alerts/A/492310/SCAM-BUSTING-TALK",
    title: "SCAM BUSTING TALK",
    description:
      "&lt;p style=&quot;margin-top: 8px&quot;&gt;&lt;strong&gt;Scams are on the increase.&lt;/strong&gt;&lt;/p&gt;&lt;p&gt;&amp;nbsp;&lt;/p&gt;",
    pubDate: "Sat, 05 Sep 2026 11:11:43 +0100",
    id: "492310",
    category: "Meeting notice",
    sentby: "The Police",
    sendername: "Richard Williams (Hampshire Constabulary, PCSO, New Forest)",
    ...overrides,
  };

  const optional = (name: string) =>
    fields[name] === "" ? "" : `      <${name}>${fields[name]}</${name}>\n`;

  return `    <item>
      <guid
        isPermaLink="false">${fields.guid}</guid>
${optional("link")}      <title>${fields.title}</title>
      <description>${fields.description}</description>
${optional("pubDate")}${optional("id")}${optional("category")}${optional("sentby")}${optional("sendername")}    </item>`;
}

/** The document, byte-order mark and all. */
function feed(...items: string[]): string {
  return `﻿<?xml version="1.0" encoding="utf-8"?>
<rss
  version="2.0">
  <channel>
    <title>Neighbourhood Alerts Feed</title>
    <description>RSS Feed of Neighbourhood Alert Messages</description>
    <copyright>2026 Neighbourhood Alert</copyright>
${items.join("\n")}
  </channel>
</rss>`;
}

/** What an unknown SiteId returns. Well-formed, and empty. */
const EMPTY_CHANNEL = feed();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseEcopsFeed", () => {
  it("reads every field off an item in the shape the live feed emits it", () => {
    const result = parseEcopsFeed(feed(item()));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [alert] = result.data.items;

    // The attribute really is on its own line in the live feed, so the element
    // matcher has to admit a newline before the `>`.
    expect(alert.externalId).toBe("492310");
    expect(alert.title).toBe("SCAM BUSTING TALK");
    expect(alert.category).toBe("Meeting notice");
    expect(alert.sentBy).toBe("The Police");
    expect(alert.senderName).toContain("Richard Williams");
    expect(alert.link).toBe(
      "https://www.hampshirealert.co.uk/Alerts/A/492310/SCAM-BUSTING-TALK",
    );
    expect(alert.publishedAt.toISOString()).toBe("2026-09-05T10:11:43.000Z");
    expect(result.data.dropped).toBe(0);
  });

  it("returns items newest first even when the feed does not", () => {
    const result = parseEcopsFeed(
      feed(
        item({
          guid: "1",
          id: "1",
          pubDate: "Mon, 01 Jun 2026 09:00:00 +0100",
        }),
        item({
          guid: "2",
          id: "2",
          pubDate: "Fri, 04 Sep 2026 09:00:00 +0100",
        }),
      ),
    );

    if (!result.ok) throw new Error("expected a parse");

    // Sorted rather than trusted. The feed happens to arrive newest-first and
    // "happens to" is not a contract.
    expect(result.data.items.map((alert) => alert.externalId)).toEqual([
      "2",
      "1",
    ]);
  });

  it("treats an empty channel as a successful read of nothing", () => {
    const result = parseEcopsFeed(EMPTY_CHANNEL);

    /*
      The property the whole feature's honesty rests on. An unknown SiteId, a
      site that has published nothing and a quiet week are one response, and
      calling it a failure would leave `EcopsSiteSync` unable to tell a fetch
      that worked from one that did not — so a coordinator who mistyped a number
      would see "could not be reached" for ever and never check the number.
    */
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.items).toHaveLength(0);
    expect(result.data.dropped).toBe(0);
  });

  it("refuses a body that is not a feed", () => {
    const result = parseEcopsFeed("<html><body>Service unavailable</body></html>");

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.code).toBe("invalid_output");
  });

  it("drops an item it cannot identify or date, and keeps the rest", () => {
    const result = parseEcopsFeed(
      feed(
        item({ guid: "", id: "" }),
        item({ guid: "5", id: "5", title: "" }),
        item({ guid: "6", id: "6", pubDate: "not a date" }),
        item({ guid: "7", id: "7" }),
      ),
    );

    if (!result.ok) throw new Error("expected a parse");

    // One bad element in somebody else's feed costs that element. A row with no
    // stable id cannot be de-duplicated and one with no date cannot be ordered,
    // so both are refused rather than stored with something invented.
    expect(result.data.items.map((alert) => alert.externalId)).toEqual(["7"]);
    expect(result.data.dropped).toBe(3);
  });

  it("stops at the item cap and says that it did", () => {
    const items = Array.from({ length: ECOPS_MAX_ITEMS_PER_SYNC + 10 }, (_, i) =>
      item({ guid: String(i), id: String(i) }),
    );

    const result = parseEcopsFeed(feed(...items));

    if (!result.ok) throw new Error("expected a parse");

    expect(result.data.items).toHaveLength(ECOPS_MAX_ITEMS_PER_SYNC);
    // Reported rather than silent — the police sync's rule. A list quietly cut
    // short looks exactly like a site with less to say.
    expect(result.data.truncated).toBe(true);
  });

  it("keeps only http(s) links and drops the rest", () => {
    const result = parseEcopsFeed(
      feed(
        item({ guid: "1", id: "1", link: "javascript:alert(1)" }),
        item({ guid: "2", id: "2", link: "/Alerts/A/1/relative" }),
        item({ guid: "3", id: "3", link: "" }),
        item({ guid: "4", id: "4", link: "http://www.wmnow.co.uk/Alerts/A/4/x" }),
      ),
    );

    if (!result.ok) throw new Error("expected a parse");

    const links = Object.fromEntries(
      result.data.items.map((alert) => [alert.externalId, alert.link]),
    );

    /*
      A message with an unusable link renders without one rather than with a
      broken or dangerous one. `javascript:` is the reason the guard exists —
      it would otherwise be one click away from a coordinator's session — and a
      relative path is the reason it cannot simply be a scheme test on a string:
      these links come from two dozen different systems.
    */
    expect(links["1"]).toBeNull();
    expect(links["2"]).toBeNull();
    expect(links["3"]).toBeNull();
    expect(links["4"]).toBe("http://www.wmnow.co.uk/Alerts/A/4/x");
  });
});

describe("toPlainText", () => {
  it("unwraps the double encoding and leaves no markup", () => {
    // An HTML document, entity-escaped so it can travel inside an XML element,
    // which is exactly what the live feed sends.
    const text = toPlainText(
      "&lt;p&gt;&lt;strong&gt;Home security&lt;/strong&gt;&lt;/p&gt;&lt;li&gt;Lock up.&amp;nbsp;&lt;/li&gt;",
    );

    expect(text).toBe("Home security Lock up.");
    expect(text).not.toContain("<");
    expect(text).not.toContain("&");
  });

  it("strips a tag that only becomes one after a second decode", () => {
    /*
      The ordering test. Decode once and strip, and this unwraps to
      `&lt;script&gt;` *behind* the stripper and arrives as a literal
      `<script>`; strip before decoding at all and the ordinary `&lt;p&gt;`
      paragraph tags survive untouched. Decoding to a fixed point first is what
      makes anything tag-shaped at any depth tag-shaped when the stripper runs.

      Defence in depth rather than the defence — nothing renders this as HTML —
      but a summary containing a literal `<script>` is a bug wherever it lands.
    */
    expect(toPlainText("&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;")).toBe(
      "alert(1)",
    );
  });

  it("removes an unsubstituted mail-merge placeholder with its salutation", () => {
    /*
      Not an edge case: the RSS copy of a message is the pre-substitution one,
      and `{FIRST_NAME}` appeared in 125 of 200 messages on one force's feed.

      The salutation has to go with the token. Dropping `{FIRST_NAME}` alone
      leaves "Dear Appeal for Information", which reads as a sentence addressed
      to "Appeal" — worse than leaving the placeholder in, because it no longer
      looks like something is missing.
    */
    expect(toPlainText("Dear {FIRST_NAME} Appeal for Information")).toBe(
      "Appeal for Information",
    );
    expect(toPlainText("Hello {FULL_NAME}, we have been in your area")).toBe(
      "we have been in your area",
    );
    // A token on its own, away from any greeting.
    expect(toPlainText("Sent to {SITE_NAME} members")).toBe("Sent to members");
  });

  it("leaves ordinary prose containing braces alone", () => {
    // The class is upper case, digits and underscores for this reason: a
    // stripper that ate `{2}` would quietly edit somebody's bulletin.
    expect(toPlainText("The code was {2} of three")).toBe(
      "The code was {2} of three",
    );
  });

  it("unwraps CDATA", () => {
    expect(toPlainText("<![CDATA[Road closed <b>today</b>]]>")).toBe(
      "Road closed today",
    );
  });
});

describe("the summary excerpt", () => {
  it("cuts at a word boundary and marks that it continues", () => {
    const long = `&lt;p&gt;${"word ".repeat(400)}&lt;/p&gt;`;
    const result = parseEcopsFeed(feed(item({ description: long })));

    if (!result.ok) throw new Error("expected a parse");

    const { summary } = result.data.items[0];

    /*
      The cap is a copyright decision rather than a layout one — this feed
      carries a copyright line and no open licence, so what is stored is an
      excerpt that travels with a link back. The ellipsis is what makes that
      link the obvious next move rather than a decoration.
    */
    expect(summary.length).toBeLessThanOrEqual(ECOPS_SUMMARY_MAX_CHARS + 1);
    expect(summary.endsWith("…")).toBe(true);
    // Cut at a space, so the last word is whole rather than sliced in half.
    expect(summary.slice(0, -1).endsWith("word")).toBe(true);
  });

  it("leaves a short body whole and unmarked", () => {
    const result = parseEcopsFeed(
      feed(item({ description: "&lt;p&gt;Road closed.&lt;/p&gt;" })),
    );

    if (!result.ok) throw new Error("expected a parse");

    expect(result.data.items[0].summary).toBe("Road closed.");
  });
});

describe("fetchEcopsAlerts", () => {
  it("asks for the site, and does not send AreaId", async () => {
    fetchMock.mockResolvedValue(xml(feed(item())));

    await fetchEcopsAlerts({ siteId: 2 });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];

    expect(url).toContain("SiteId=2");
    /*
      `AreaId` returned an empty channel for every value tried inside a valid
      site, so it is not usable without a lookup this API does not publish. A
      parameter that silently returns nothing is worse than one that is not
      sent, and this is what stops somebody adding it back on the strength of
      the documentation.
    */
    expect(url).not.toContain("AreaId");
  });

  it("returns a value rather than throwing for every failure", async () => {
    const cases: Array<[string, () => void, string]> = [
      [
        "a non-2xx",
        () => fetchMock.mockResolvedValue(xml("", 500)),
        "upstream",
      ],
      [
        "a dead socket",
        () => fetchMock.mockRejectedValue(new Error("ECONNRESET")),
        "network",
      ],
      [
        "a timeout",
        () =>
          fetchMock.mockRejectedValue(
            new DOMException("The operation was aborted", "TimeoutError"),
          ),
        "timeout",
      ],
      [
        "a body that is not a feed",
        () => fetchMock.mockResolvedValue(xml("<html>nope</html>")),
        "invalid_output",
      ],
    ];

    for (const [, arrange, code] of cases) {
      fetchMock.mockReset();
      arrange();

      // Never `rejects`. A cron looping over sites and a dashboard panel are
      // the only callers, and a throw ends the sweep in the first case and
      // renders an error page in the second.
      const result = await fetchEcopsAlerts({ siteId: 2 });

      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.code).toBe(code);
    }
  });

  it("reports an empty channel as a successful read", async () => {
    fetchMock.mockResolvedValue(xml(EMPTY_CHANNEL));

    const result = await fetchEcopsAlerts({ siteId: 99999 });

    // A mistyped site number reaches here, and it must not look like an
    // outage — see the header.
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toHaveLength(0);
  });
});

describe("isPoliceSender", () => {
  it("claims police authorship only for the feed's own police value", () => {
    expect(isPoliceSender("The Police")).toBe(true);
    expect(isPoliceSender("the police")).toBe(true);

    /*
      Errs towards *not* claiming it. The feed carries scheme names beyond the
      two common ones — "Hotel Watch", "System Administrators" — and labelling a
      scheme's message as a force's is the error that matters, because the badge
      is what tells a reader how much authority the message carries.
    */
    expect(isPoliceSender("Neighbourhood Watch")).toBe(false);
    expect(isPoliceSender("Hotel Watch")).toBe(false);
    expect(isPoliceSender(null)).toBe(false);
    expect(isPoliceSender(undefined)).toBe(false);
  });
});
