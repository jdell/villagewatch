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
/**
 * Every field that carries a value, flattened.
 *
 * `phone` is nullable — no telephone is published, and the constant says why —
 * so an omitted field is filtered out before the placeholder check rather than
 * being treated as one. The distinction is the whole of what this file is
 * about: a field that is *absent* renders nothing, and a field that still holds
 * bracket text renders the brackets.
 */
const CONTROLLER_VALUES: string[] = [
  DATA_CONTROLLER.name,
  ...DATA_CONTROLLER.addressLines,
  DATA_CONTROLLER.email,
  DATA_CONTROLLER.phone,
  DATA_CONTROLLER.icoRegistration,
].filter((value): value is string => value !== null);

const PLACEHOLDERS = CONTROLLER_VALUES.filter(isPlaceholderDetail);

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

  it("is filled in for every field it carries, or none of them", () => {
    // A half-filled object is the state that would slip a placeholder past the
    // name check and onto the page behind it — a real council named above an
    // address reading `[Town]`.
    //
    // `icoRegistration` is deliberately outside this check and always has been.
    // It is the one field whose honest value can be a sentence rather than a
    // number — a registration is applied for and then waited on — so "filled in"
    // is not the right question to ask of it. What it still may not be is
    // bracket text, which the page-level assertions below enforce on it like
    // any other rendered value.
    const filled = [
      DATA_CONTROLLER.name,
      ...DATA_CONTROLLER.addressLines,
      DATA_CONTROLLER.email,
      DATA_CONTROLLER.phone,
    ]
      .filter((value): value is string => value !== null)
      .map((value) => !isPlaceholderDetail(value));

    expect(new Set(filled).size).toBe(1);
  });

  it("publishes a postal address and an email, whatever else it omits", () => {
    // Article 13(1)(a) is the reason this object exists at all. A telephone is
    // optional and is currently absent; a way to reach the controller in
    // writing is not, and a resident's subject access request is the thing that
    // depends on it.
    expect(HAS_FALLBACK_CONTROLLER_DETAILS).toBe(true);
    expect(DATA_CONTROLLER.addressLines.length).toBeGreaterThan(0);
    expect(DATA_CONTROLLER.email).toContain("@");
  });

  it("never labels the controller with a placeholder", () => {
    // `CONTROLLER_LABEL` goes into six sentences on `/terms` that have to read
    // correctly either way. The role is true in both models and both states.
    expect(isPlaceholderDetail(CONTROLLER_LABEL)).toBe(false);
    expect(CONTROLLER_LABEL).not.toContain("[");
  });

  it("labels the controller with a role and never with the fallback's name", () => {
    // Two sentences on `/terms` are written *about* the role — §1's "read it as
    // whichever of the two runs your village" and §12's "in most villages that
    // is your coordinator" — so a company name substituted in tells a reader to
    // treat a named third party as their own coordinator. `DATA_CONTROLLER` is
    // the fallback *contact route* on two sessionless pages, not an answer to
    // who controls a given village, and this is the line that keeps the two
    // apart.
    expect(CONTROLLER_LABEL).not.toBe(DATA_CONTROLLER.name);
    expect(CONTROLLER_LABEL).not.toContain(DATA_CONTROLLER.name);
  });
});

describe("the fallback contact block", () => {
  const privacy = PAGES.find((page) => page.name === "/privacy")!.markup;

  it("publishes the ICO registration line", () => {
    // It moves between two boxes depending on `FALLBACK_CONTROLLER_IS_OPERATOR`,
    // and a refactor that merges them is exactly where a line gets dropped. The
    // reference is what makes a pending registration checkable rather than a
    // claim, so losing it silently is losing the point of publishing it.
    expect(privacy).toContain(DATA_CONTROLLER.icoRegistration);
  });

  it("publishes somewhere to write", () => {
    expect(privacy).toContain(DATA_CONTROLLER.addressLines[0]);
    expect(privacy).toContain(`mailto:${DATA_CONTROLLER.email}`);
  });

  it("does not present the operator as the controller and then deny it", () => {
    // The regression this pins is one only a rendered page shows. `/privacy` §1
    // draws a box for the fallback controller and, beneath it, a box for the
    // operator that says in bold it is **not** the controller. While those were
    // different bodies that read correctly. Once `DATA_CONTROLLER` was filled in
    // with the operator's own details, the page printed the same company twice —
    // presented as the controller, then declared not to be, in adjacent blocks.
    //
    // Asserting a phrase rather than a property, deliberately, because the
    // defect *is* a phrase: there is no structural difference between one box
    // and two that a string render can see. If the copy is reworded, reword this
    // with it rather than deleting it.
    //
    // The guard compares the two constants directly rather than reading
    // `FALLBACK_CONTROLLER_IS_OPERATOR`, and that is the difference between a
    // test and a tautology: the flag is what *drives* the rendering, so guarding
    // on it means breaking the flag also switches the assertion off. Deriving
    // the condition from the data means a flag stuck at `false` while both names
    // still match — which is precisely the bug — fails here. Mutation-checked.
    if (DATA_CONTROLLER.name === OPERATOR.name) {
      expect(privacy).not.toContain(
        "fallback where no village-specific controller has been named",
      );
      expect(privacy).toContain("not</strong> the controller");
    }
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
