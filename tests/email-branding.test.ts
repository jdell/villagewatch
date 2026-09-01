import { describe, expect, it } from "vitest";
import type { EmailMessage } from "@/lib/email/layout";
import { coordinatorDecisionEmail } from "@/lib/email/coordinator-decision";
import { incidentNotificationEmail } from "@/lib/email/incident-notification";
import { weeklyDigestEmail } from "@/lib/email/weekly-digest";
import { welcomeEmail } from "@/lib/email/welcome";

/**
 * The branded shell, across every email VillageWatch sends itself.
 *
 * The four Supabase auth templates have had `tests/supabase-templates.test.ts`
 * watching them since they were written, and the four transactional ones had
 * nothing — which is how the welcome came to be the only email the service
 * sent that did not look like the service. All eight go through the same
 * `renderEmail`, so what this pins is that they still do.
 *
 * What is asserted is the promise rather than the wording, for the reason
 * `compliance-documents.test.ts` sets out. The sentences in these are copy
 * under revision; the shell is not.
 *
 * The load-bearing assertion is the **absolute** mark URL. An email has no base
 * href, so a relative `src` — which is what a careless refactor of `appUrl`
 * would produce, and what would look perfectly correct in a diff — is a broken
 * image in every inbox that receives it, and nothing in the application would
 * show it.
 */

/** The mark, the brand bar and the footer's two public links. */
const BRAND_COLOUR = "#0f2557";
const MARK_SRC = "https://villagewatch.app/android-chrome-192x192.png";

const MESSAGES: readonly { name: string; message: EmailMessage }[] = [
  {
    name: "welcome",
    message: welcomeEmail({
      fullName: "Sam Okonkwo",
      villageName: "Little Barford",
    }),
  },
  {
    name: "incident notification",
    message: incidentNotificationEmail({
      villageName: "Little Barford",
      incidentId: "inc_1",
      reference: "VW-LIT-2026-0003",
      type: "BURGLARY",
      severity: "HIGH",
      title: "Shed broken into overnight",
      description: "A shed was forced open on a residential lane.",
      locationText: "Mill Lane",
      occurredAt: new Date("2026-08-20T21:30:00Z"),
    }),
  },
  {
    name: "weekly digest",
    message: weeklyDigestEmail({
      villageName: "Little Barford",
      title: "A quiet week, with one exception",
      summary: "Six reports, five of them low severity.",
      hotspots: [{ location: "Mill Lane", note: "Two reports in four days." }],
      advice: ["Check shed padlocks."],
      severity: "MEDIUM",
      incidentCount: 6,
      previousPeriodCount: 4,
      windowStart: new Date("2026-08-17T00:00:00Z"),
      windowEnd: new Date("2026-08-24T00:00:00Z"),
    }),
  },
  {
    name: "coordinator decision (approved)",
    message: coordinatorDecisionEmail({
      fullName: "Sam Okonkwo",
      villageName: "Little Barford",
      approved: true,
    }),
  },
  {
    name: "coordinator decision (declined)",
    message: coordinatorDecisionEmail({
      fullName: "Sam Okonkwo",
      villageName: "Little Barford",
      approved: false,
      note: "Please ask your parish clerk to confirm the role first.",
    }),
  },
];

describe("the branded email shell", () => {
  it.each(MESSAGES)("$name renders both parts", ({ message }) => {
    // The text part is the message, not a fallback — see the header of
    // `src/lib/email/layout.ts`.
    expect(message.text.trim().length).toBeGreaterThan(0);
    expect(message.subject.trim().length).toBeGreaterThan(0);
    expect(message.html).toBeTypeOf("string");
  });

  it.each(MESSAGES)("$name is a complete document", ({ message }) => {
    const html = message.html ?? "";

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });

  it.each(MESSAGES)("$name carries the brand bar and the mark", ({ message }) => {
    const html = message.html ?? "";

    expect(html).toContain(BRAND_COLOUR);
    expect(html).toContain(MARK_SRC);

    // Decorative: the wordmark in the cell beside it already says the name, so
    // a described image would be read out twice.
    expect(html).toContain('alt=""');
  });

  it.each(MESSAGES)(
    "$name links the mark absolutely, because an email has no base href",
    ({ message }) => {
      const src = /<img[^>]*\ssrc="([^"]+)"/.exec(message.html ?? "")?.[1];

      expect(src).toBeDefined();
      expect(() => new URL(src ?? "")).not.toThrow();
      expect(src?.startsWith("https://")).toBe(true);
    },
  );

  it.each(MESSAGES)("$name offers the same footer routes", ({ message }) => {
    const html = message.html ?? "";

    // Every one of these is read by somebody who is signed in, so unlike the
    // auth templates the settings link is the right one to offer.
    expect(html).toContain("/settings");
    expect(html).toContain("/privacy");
    expect(html).toContain("/terms");
  });

  it("escapes a village name rather than rendering it as markup", () => {
    const { html } = welcomeEmail({
      fullName: "Sam",
      villageName: '<script>alert("x")</script>',
    });

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
