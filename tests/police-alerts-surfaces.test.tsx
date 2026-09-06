import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  EcopsAlertList,
  EcopsEmptyState,
} from "@/components/dashboard/ecops-alert-list";
import { PoliceAlertsPanel } from "@/components/dashboard/police-alerts-panel";
import { ECOPS_AREA_NOTE } from "@/lib/constants";
import type { VillageEcopsAlert, VillageEcopsAlerts } from "@/lib/ecops/alerts";

/**
 * The two surfaces that render a police bulletin, and the one thing they are
 * meant to disagree about.
 *
 * The third component test in the suite, earning the exception the way
 * `period-control.test.tsx` does: no secret, no database and no DOM, because
 * what it asserts is the markup rendered to a string by `react-dom/server`.
 *
 * ## The regression it exists for
 *
 * `PoliceAlertsPanel` renders **nothing at all** when the village has no site
 * set; `/dashboard/police-alerts` renders an explanation and a link to the
 * settings field. That looks like an inconsistency and is not — a permanently
 * blank card on a working page is clutter, and a destination that renders
 * nothing is a dead sidebar entry for the one feature whose configuration a
 * coordinator cannot discover any other way. `CLAUDE.md` says a tidying pass
 * that makes two deliberately-different failure directions consistent "will
 * look like an improvement in the diff", which is exactly the shape of this
 * one. The panel's half is pinned here.
 *
 * ## What it deliberately does not assert
 *
 * No wording, for the reason `compliance-documents.test.ts` gives — these are
 * sentences under revision. What is asserted is presence, absence and which of
 * the three empty states was chosen, none of which is a copy decision.
 *
 * The page component itself is not rendered: it is an async Server Component
 * that calls `requireCoordinator()`, so reaching it would mean mocking the
 * session for a test whose subject is the markup. Its unconfigured branch is a
 * plain `data.siteId === null` check over the same read this file feeds the
 * panel.
 */

function alert(over: Partial<VillageEcopsAlert> = {}): VillageEcopsAlert {
  return {
    id: "a1",
    title: "Shed break-ins on the Cambridge road",
    summary: "Three overnight, all with the padlock cut.",
    category: "Burglary",
    sentBy: "The Police",
    senderName: "PCSO Amina Okafor",
    link: "https://example.test/alerts/1",
    publishedAt: new Date("2026-09-01T09:00:00Z"),
    ...over,
  };
}

function data(over: Partial<VillageEcopsAlerts> = {}): VillageEcopsAlerts {
  return {
    siteId: 2,
    alerts: [alert()],
    status: "ok",
    lastSuccessAt: new Date("2026-09-02T04:00:00Z"),
    lastAttemptAt: new Date("2026-09-02T04:00:00Z"),
    ...over,
  };
}

describe("PoliceAlertsPanel", () => {
  it("renders nothing at all when the village has no site set", () => {
    // Not "renders an empty card". The whole point of the null return is that
    // a village that never wants this feature does not carry a blank panel on
    // its dashboard for ever.
    const html = renderToStaticMarkup(
      <PoliceAlertsPanel data={data({ siteId: null, alerts: [] })} />,
    );

    expect(html).toBe("");
  });

  it("offers the way through only when there is something to go and read", () => {
    const withAlerts = renderToStaticMarkup(
      <PoliceAlertsPanel data={data()} />,
    );
    const withNone = renderToStaticMarkup(
      <PoliceAlertsPanel data={data({ alerts: [], status: "empty" })} />,
    );

    expect(withAlerts).toContain("/dashboard/police-alerts");
    // A link to a fuller view of nothing is a link somebody follows once.
    expect(withNone).not.toContain("/dashboard/police-alerts");
  });

  it("renders the area caveat above the alerts, not below them", () => {
    const html = renderToStaticMarkup(<PoliceAlertsPanel data={data()} />);

    // Against the constant, not a guess at its wording — the sentence is copy
    // under revision and its *position* is the promise.
    const caveat = html.indexOf(ECOPS_AREA_NOTE.slice(0, 40));
    const title = html.indexOf("Shed break-ins");

    expect(caveat).toBeGreaterThan(-1);
    expect(title).toBeGreaterThan(-1);
    // A caveat somebody reaches after forming an impression has already failed.
    expect(caveat).toBeLessThan(title);
  });
});

describe("EcopsEmptyState", () => {
  // Three states that all show zero alerts, and the coordinator's next move is
  // different for each. Collapsing them would leave somebody who mistyped their
  // site number waiting indefinitely for a feed answering perfectly well.
  it("tells a mistyped site apart from a quiet one and from a failure", () => {
    const never = renderToStaticMarkup(
      <EcopsEmptyState status={null} siteId={2} />,
    );
    const empty = renderToStaticMarkup(
      <EcopsEmptyState status="empty" siteId={2} />,
    );
    const failed = renderToStaticMarkup(
      <EcopsEmptyState status="failed" siteId={2} />,
    );

    expect(new Set([never, empty, failed]).size).toBe(3);
    // The empty one is the only state where the number itself is suspect, so it
    // is the only one that names it.
    expect(empty).toContain("2");
  });
});

describe("EcopsAlertList", () => {
  it("does not give a watch scheme's message a police badge", () => {
    const police = renderToStaticMarkup(
      <EcopsAlertList alerts={[alert({ sentBy: "The Police" })]} />,
    );
    const scheme = renderToStaticMarkup(
      <EcopsAlertList
        alerts={[alert({ id: "a2", sentBy: "Neighbourhood Watch" })]}
      />,
    );

    // Labelling a scheme's message as a force's is the error that matters, so
    // the two must not render the same badge.
    expect(police).toContain("indigo");
    expect(scheme).not.toContain("indigo");
  });

  it("renders an unknown sender as itself rather than flattening it", () => {
    const html = renderToStaticMarkup(
      <EcopsAlertList alerts={[alert({ sentBy: "Barnwell Watch Scheme" })]} />,
    );

    // Falling through to "Police" would be a claim about who sent it.
    expect(html).toContain("Barnwell Watch Scheme");
  });

  it("omits the link entirely rather than rendering a dead one", () => {
    const html = renderToStaticMarkup(
      <EcopsAlertList alerts={[alert({ link: null })]} />,
    );

    expect(html).not.toContain("<a");
  });
});
