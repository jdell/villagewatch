import { describe, expect, it } from "vitest";
import {
  facebookShareUrl,
  formatIncidentAlert,
  incidentUrl,
  truncateWords,
  whatsappShareUrl,
  type AlertIncident,
} from "@/lib/format-alert";
import {
  ALERT_DESCRIPTION_MAX_CHARS,
  SEVERITY_META,
  WHATSAPP_POST_MAX_CHARS,
} from "@/lib/constants";

/**
 * This is the one surface in the app whose output an unauthenticated stranger
 * can read, and it is pasted by hand into a public channel. Two properties are
 * therefore worth pinning down:
 *
 *   * the severity and the place survive, because they are what a reader acts
 *     on at a glance on a phone;
 *   * **the link is never sacrificed to the length limit** — a very long report
 *     loses its summary, not the address of the full one.
 */

const APP_URL = "https://villagewatch.example";

function incident(overrides: Partial<AlertIncident> = {}): AlertIncident {
  return {
    id: "abc123",
    title: "Shed broken into overnight",
    severity: "HIGH",
    description: "A garden shed was forced open overnight and tools were taken.",
    locationText: "The lane behind the village hall",
    occurredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    ...overrides,
  };
}

describe("formatIncidentAlert", () => {
  it("leads with the severity emoji and the severity in upper case", () => {
    const alert = formatIncidentAlert(incident(), APP_URL);

    expect(alert.startsWith(SEVERITY_META.HIGH.emoji)).toBe(true);
    // Upper case: the one word that has to survive being read at arm's length.
    expect(alert).toContain(`${SEVERITY_META.HIGH.emoji} HIGH — Shed broken into overnight`);
  });

  it("carries the emoji for every severity", () => {
    for (const severity of ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const) {
      const alert = formatIncidentAlert(incident({ severity }), APP_URL);

      expect(alert).toContain(SEVERITY_META[severity].emoji);
      expect(alert).toContain(SEVERITY_META[severity].label.toUpperCase());
    }
  });

  it("carries the location and how long ago it was", () => {
    const alert = formatIncidentAlert(incident(), APP_URL);

    expect(alert).toContain("📍 The lane behind the village hall");
    expect(alert).toMatch(/📍 .+ · .+ago/);
  });

  it("falls back to a clock line when there is no landmark", () => {
    const alert = formatIncidentAlert(incident({ locationText: null }), APP_URL);

    expect(alert).not.toContain("📍");
    expect(alert).toContain("🕒");
  });

  it("carries the description and a link to the full report", () => {
    const alert = formatIncidentAlert(incident(), APP_URL);

    expect(alert).toContain("A garden shed was forced open overnight");
    expect(alert).toContain(`View details: ${APP_URL}/incident/abc123`);
  });

  it("adds the pattern note only when the report is recurring", () => {
    const note = "4th report of vehicle crime within 200m this month";

    expect(
      formatIncidentAlert(incident({ recurring: true, patternNote: note }), APP_URL),
    ).toContain(`⚠️ Pattern: ${note}`);

    // A note without a pattern reads as a warning that was never made.
    expect(
      formatIncidentAlert(incident({ recurring: false, patternNote: note }), APP_URL),
    ).not.toContain("⚠️ Pattern");
  });

  it("keeps the link when the description is far too long", () => {
    const alert = formatIncidentAlert(
      incident({ description: "The mower was taken. ".repeat(200) }),
      APP_URL,
    );

    // The half a reader can do something with.
    expect(alert).toContain(`View details: ${APP_URL}/incident/abc123`);
    expect(alert).toContain("📍 The lane behind the village hall");
    expect(alert.length).toBeLessThanOrEqual(WHATSAPP_POST_MAX_CHARS);
  });

  it("truncates the description to the summary length", () => {
    const alert = formatIncidentAlert(
      incident({ description: "mower ".repeat(300) }),
      APP_URL,
    );

    expect(alert).toContain("…");
    const body = alert.split("\n")[2];
    expect(body.length).toBeLessThanOrEqual(ALERT_DESCRIPTION_MAX_CHARS);
  });

  it("still produces an alert when there is no description at all", () => {
    const alert = formatIncidentAlert(incident({ description: "   " }), APP_URL);

    expect(alert).toContain("HIGH — Shed broken into overnight");
    expect(alert).toContain("View details:");
  });

  it("falls back to a relative link rather than throwing on a broken base URL", () => {
    // This runs inside a render; a malformed NEXT_PUBLIC_APP_URL should cost a
    // shorter link in a clipboard, not a blank screen.
    const alert = formatIncidentAlert(incident(), "not a url");

    expect(alert).toContain("View details: /incident/abc123");
  });

  it("carries no coordinates and no verbatim wording", () => {
    // Structural, not incidental: `AlertIncident` has no field for either. This
    // asserts the format does not smuggle one in from somewhere else.
    const alert = formatIncidentAlert(incident(), APP_URL);

    expect(alert).not.toMatch(/-?\d{1,3}\.\d{4,}/);
    expect(alert).not.toContain("rawDescription");
  });
});

describe("the share links", () => {
  const url = incidentUrl("abc123", APP_URL);

  it("sends the alert to WhatsApp encoded", () => {
    const share = whatsappShareUrl("🔴 HIGH — Shed & tools");

    expect(share.startsWith("https://wa.me/?text=")).toBe(true);
    // Decoded rather than string-matched: what matters is that the text arrives
    // intact, not which encoder produced it.
    expect(
      decodeURIComponent(share.slice("https://wa.me/?text=".length)),
    ).toBe("🔴 HIGH — Shed & tools");
  });

  it("shares the report's own page and offers the alert as the message", () => {
    const share = facebookShareUrl(url, "🔴 HIGH — Shed broken into");

    expect(share).not.toBeNull();

    const parsed = new URL(share!);

    expect(parsed.origin + parsed.pathname).toBe(
      "https://www.facebook.com/sharer/sharer.php",
    );
    // `u` is the half that does the work — Facebook builds the card from it.
    expect(parsed.searchParams.get("u")).toBe(`${APP_URL}/incident/abc123`);
    expect(parsed.searchParams.get("quote")).toBe("🔴 HIGH — Shed broken into");
  });

  it("shares the same address the alert text carries", () => {
    // One builder, two surfaces. A card pointing at one report under the text of
    // another is the failure this rules out.
    const alert = formatIncidentAlert(incident(), APP_URL);
    const share = new URL(facebookShareUrl(url, alert)!);

    expect(alert).toContain(`View details: ${share.searchParams.get("u")}`);
  });

  it("refuses a relative URL rather than posting a dead link", () => {
    // `incidentUrl` falls back to a path on a malformed base, and a share of
    // `/incident/abc123` would post `facebook.com/incident/abc123` to a public
    // feed — a broken link that reads as a working one. The button is hidden.
    expect(incidentUrl("abc123", "not a url")).toBe("/incident/abc123");
    expect(facebookShareUrl("/incident/abc123", "text")).toBeNull();
    expect(facebookShareUrl("", "text")).toBeNull();
  });

  /**
   * The growth loop, pinned.
   *
   * Every link a coordinator shares has to reach somebody with no account.
   * Aimed at `/incidents/[id]` — the authenticated detail page, which is in
   * `PROTECTED_ROUTES` — these are a redirect to `/login`, and the person who
   * tapped the link has never heard of VillageWatch. The singular is the public
   * preview.
   *
   * Asserted on the path rather than the whole string, and asserted negatively
   * as well, because the two differ by one letter: a "tidy-up" that pluralised
   * it back would break every shared link and nothing else in the suite would
   * notice.
   */
  it("points every shared link at the public preview, never the private page", () => {
    expect(new URL(url).pathname).toBe("/incident/abc123");
    expect(new URL(url).pathname.startsWith("/incidents")).toBe(false);

    const alert = formatIncidentAlert(incident(), APP_URL);

    expect(alert).toContain(`${APP_URL}/incident/abc123`);
    expect(alert).not.toContain(`${APP_URL}/incidents/`);
  });

  it("refuses a scheme that is not http or https", () => {
    // Nothing here builds one, but this value ends up in `window.open`.
    expect(facebookShareUrl("javascript:alert(1)", "text")).toBeNull();
  });
});

describe("truncateWords", () => {
  it("leaves a short string alone", () => {
    expect(truncateWords("A short line.", 40)).toBe("A short line.");
  });

  it("cuts on a word boundary", () => {
    expect(truncateWords("one two three four five six", 20)).toBe("one two three four…");
  });

  it("cuts mid-word rather than throw most of the budget away", () => {
    // A single 400-character "word" is a URL somebody pasted into a report;
    // losing all of it is worse than cutting it.
    const url = `https://example.test/${"a".repeat(200)}`;

    expect(truncateWords(url, 40)).toHaveLength(40);
  });
});
