import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PrivacyPage from "@/app/privacy/page";
import TermsPage from "@/app/terms/page";
import {
  CONTROLLER_LABEL,
  DATA_CONTROLLER,
  HAS_FALLBACK_CONTROLLER_DETAILS,
  OPERATOR,
  isPlaceholderDetail,
} from "@/lib/constants";

/**
 * The two public legal pages, and the one thing neither of them may do: print
 * unfilled placeholder text to a resident.
 *
 * ## The bug this pins
 *
 * `DATA_CONTROLLER` is placeholders — `[Data controller name]`,
 * `[contact@example.uk]`, `[ICO registration number]` — and both pages rendered
 * them verbatim. A resident on `/privacy` looking for where to send a subject
 * access request was given `[contact@example.uk]`; `/terms` told them that
 * "neither VillageWatch nor [Data controller name] is liable". That is a broken
 * right-of-access route on a live public page, and bracket text is the worst
 * shape for it to take: most people read it as a rendering fault rather than as
 * a gap somebody has to fill, so nobody reports it.
 *
 * It stayed there because **the placeholders are not simply a value nobody got
 * round to setting**. The controller genuinely differs per village — a parish
 * council in one model, the coordinator in the other — and these two pages are
 * public and sessionless, so they cannot read a village to find out which. There
 * is no single true name to put there, which is why "fill in the constant" was
 * never the whole fix and why this went eight weeks without one.
 *
 * ## What is asserted
 *
 * The **rendered markup**, the way `period-control.test.tsx` does it, and for
 * the same reasons: `react-dom/server` needs no secret, no database and no DOM,
 * so `environment: "node"` is untouched and jsdom is still not a dependency.
 *
 * Two properties, and they hold in **both** states of the constant:
 *
 *   * no square-bracket placeholder appears anywhere in either page, and
 *   * there is always at least one working contact route on each — a real
 *     mailto, so a resident who cannot reach their coordinator is never left
 *     with nowhere to go.
 *
 * Writing it against both states is the point. Today the fallback is unfilled
 * and the branch under test is the operator one; the day somebody fills
 * `DATA_CONTROLLER` in, this file keeps testing the branch that then renders,
 * and the assertion that catches a half-filled object — a real name beside a
 * placeholder email — is `every field or none` below.
 *
 * ## What it deliberately does not assert
 *
 * Any wording. These are documents under review and a test that failed whenever
 * somebody improved a sentence is the one `compliance-documents.test.ts`
 * explains why this suite does not write. What is pinned is the shape of the
 * failure, not the prose.
 */

const privacy = renderToStaticMarkup(<PrivacyPage />);
const terms = renderToStaticMarkup(<TermsPage />);

const PAGES = [
  { name: "/privacy", markup: privacy },
  { name: "/terms", markup: terms },
] as const;

/**
 * Every unfilled field, in the shape it would reach the page in.
 *
 * Built from the constant rather than written out, so a field added to
 * `DATA_CONTROLLER` and then rendered is caught here rather than by a resident.
 */
const PLACEHOLDERS = [
  DATA_CONTROLLER.name,
  ...DATA_CONTROLLER.addressLines,
  DATA_CONTROLLER.email,
  DATA_CONTROLLER.phone,
  DATA_CONTROLLER.icoRegistration,
].filter(isPlaceholderDetail);

describe("the placeholder detector", () => {
  it("recognises a bracketed value and leaves a real one alone", () => {
    expect(isPlaceholderDetail("[Data controller name]")).toBe(true);
    // Leading whitespace is laundering, in the sense `incident-csv.ts` means it.
    expect(isPlaceholderDetail("  [Town]")).toBe(true);

    expect(isPlaceholderDetail("Histon and Impington Parish Council")).toBe(
      false,
    );
    expect(isPlaceholderDetail("clerk@histonparish.gov.uk")).toBe(false);
  });

  it("agrees with the flag the pages branch on", () => {
    expect(HAS_FALLBACK_CONTROLLER_DETAILS).toBe(
      !isPlaceholderDetail(DATA_CONTROLLER.name),
    );
  });

  it("is filled in for every field or none of them", () => {
    // A half-filled object is the state that would slip a placeholder past the
    // name check and onto the page behind it — a real council named above an
    // address reading `[Town]`.
    const filled = [
      DATA_CONTROLLER.name,
      ...DATA_CONTROLLER.addressLines,
      DATA_CONTROLLER.email,
      DATA_CONTROLLER.phone,
    ].map((value) => !isPlaceholderDetail(value));

    expect(new Set(filled).size).toBe(1);
  });

  it("never labels the controller with a placeholder", () => {
    // `CONTROLLER_LABEL` goes into six sentences on `/terms` that have to read
    // correctly either way. The role is true in both models and both states.
    expect(isPlaceholderDetail(CONTROLLER_LABEL)).toBe(false);
    expect(CONTROLLER_LABEL).not.toContain("[");
  });
});

describe.each(PAGES)("$name", ({ markup }) => {
  it("renders no placeholder from the controller constant", () => {
    for (const placeholder of PLACEHOLDERS) {
      expect(markup).not.toContain(placeholder);
    }
  });

  it("renders no bracketed placeholder at all", () => {
    // Broader than the loop above and deliberately so: it catches a placeholder
    // written straight into the page rather than read from the constant, which
    // is how the compliance screen ended up with one in its own copy.
    //
    // Any bracketed run of four characters or more, with **no** anchor on the
    // first one. An earlier draft of this required a capital and would have let
    // `[contact@example.uk]` through — which is the single worst one to miss,
    // because it is the address a subject access request is sent to.
    expect(markup).not.toMatch(/\[[^\]]{4,}\]/);
  });

  it("offers at least one contact address that works", () => {
    // The whole point of the change. A notice that names no route is no better
    // than one that names a fake.
    expect(markup).toContain("mailto:");
  });

  it("names the operator as a route when no controller is named", () => {
    if (HAS_FALLBACK_CONTROLLER_DETAILS) return;

    expect(markup).toContain(OPERATOR.email);
    expect(markup).toContain(OPERATOR.name);
  });
});
