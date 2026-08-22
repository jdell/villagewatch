import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportPeriodPicker } from "@/components/reports/report-period-picker";
import { TimeRangeFields } from "@/components/time-range-fields";
import { BROWSE_RANGE_VALUES, DASHBOARD_RANGE_VALUES } from "@/lib/constants";
import { resolveDashboardRange, resolveTimeRange } from "@/lib/date-range";

/**
 * The period control on `/dashboard`, `/incidents` and `/reports`.
 *
 * ## Why there is a component test here at all
 *
 * The suite covers no other React component, for the reason `vitest.config.ts`
 * gives: a component test usually wants a browser, and a suite that wanted one
 * would stop being the thing CI can run on every push with no environment. This
 * one earns the exception the way `compliance-documents.test.ts` earns its trip
 * to the disk — it needs no secret, no database and no DOM, because what it
 * asserts is the *markup*, rendered to a string by `react-dom/server`.
 *
 * And the regression it catches is one that has already happened twice. Two
 * date inputs sat permanently on all three of these screens, ignored by both
 * resolvers for every preset but `custom` — so a coordinator filling them in
 * under "Last 7 days" watched nothing move. `/reports` was fixed first and the
 * other two kept the fault for another PR. What is asserted is therefore the
 * promise rather than the implementation: under a preset there is **no date
 * input in the document**, and under a custom range there is a chip that opens
 * one.
 *
 * ## What it deliberately does not assert
 *
 * Nothing that needs a click. The popover, the two-month grid and the
 * anchor-then-second-click selection are all behind `open`, which starts false
 * on the server — so this file sees the closed state, which is what a reader
 * with no JavaScript gets, and `tests/calendar.test.ts` covers the arithmetic
 * the grid is drawn from. Asserting the open state would want jsdom.
 *
 * The clock is passed in, like everywhere else here. A test that read the real
 * one would be a test that failed at midnight.
 */

const NOW = new Date(2026, 6, 28, 12, 0, 0);
const TODAY = "2026-07-28";

function dashboard(params: Record<string, string>) {
  return renderToStaticMarkup(
    <TimeRangeFields
      range={resolveDashboardRange(params, NOW)}
      presets={DASHBOARD_RANGE_VALUES}
      today={TODAY}
      submitLabel="Apply"
    />,
  );
}

describe("the period control", () => {
  it("renders no date input under a preset", () => {
    const html = dashboard({ range: "7" });
    expect(html).not.toContain('type="date"');
    expect(html).toContain('name="range"');
    expect(html).toContain("Custom range");
  });

  it("carries from and to as hidden inputs under a preset", () => {
    const html = dashboard({ range: "7" });
    expect(html).toContain('type="hidden" name="from"');
    expect(html).toContain('type="hidden" name="to"');
  });

  it("shows the chip under a custom range", () => {
    const html = dashboard({
      range: "custom",
      from: "2026-06-15",
      to: "2026-07-07",
    });
    expect(html).toContain("15 Jun");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('type="date"');
  });

  it("offers only the presets the screen asked for", () => {
    const html = dashboard({ range: "7" });
    expect(html).toContain("Last 90 days");
    expect(html).not.toContain("All time");

    const list = renderToStaticMarkup(
      <TimeRangeFields
        range={resolveTimeRange({ range: "7" }, { now: NOW })}
        presets={BROWSE_RANGE_VALUES}
        today={TODAY}
      />,
    );
    expect(list).toContain("All time");
    expect(list).not.toContain("Last 90 days");
    // No submit button of its own — /incidents supplies one.
    expect(list).not.toContain('type="submit"');
  });

  it("still collapses the dates on /reports", () => {
    const preset = renderToStaticMarkup(
      <ReportPeriodPicker
        preset="7"
        from="2026-07-21"
        to="2026-07-28"
        today={TODAY}
        notice={null}
      />,
    );
    expect(preset).not.toContain('type="date"');
    expect(preset).not.toContain('aria-haspopup="dialog"');

    const custom = renderToStaticMarkup(
      <ReportPeriodPicker
        preset="custom"
        from="2026-06-15"
        to="2026-07-07"
        today={TODAY}
        notice={null}
      />,
    );
    expect(custom).toContain('aria-haspopup="dialog"');
  });
});
