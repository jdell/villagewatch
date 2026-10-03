import { describe, expect, it } from "vitest";
import {
  LIVE_WINDOW_HOURS,
  canMarkOver,
  isHappeningNow,
  reportBannerKind,
} from "@/lib/incident-live";

/**
 * "Happening now" and the report page's banner — derived from the time and
 * `endedAt`, never stored. What is asserted is the window's two edges, that a
 * report in the queue is never live (domain rule 6), that saying it is over
 * ends it, and that the banner is always exactly one thing.
 */

const NOW = Date.UTC(2026, 9, 3, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

function at(hoursAgo: number) {
  return new Date(NOW - hoursAgo * HOUR);
}

describe("isHappeningNow", () => {
  it("is live inside the window and not at its edge", () => {
    expect(
      isHappeningNow({ status: "PUBLISHED", occurredAt: at(0.5), endedAt: null }, NOW),
    ).toBe(true);
    expect(
      isHappeningNow(
        { status: "PUBLISHED", occurredAt: at(LIVE_WINDOW_HOURS), endedAt: null },
        NOW,
      ),
    ).toBe(false);
  });

  it("counts a slightly future occurrence as now", () => {
    expect(
      isHappeningNow({ status: "PUBLISHED", occurredAt: at(-0.1), endedAt: null }, NOW),
    ).toBe(true);
  });

  it("is never live in the queue, resolved, or once somebody said it is over", () => {
    for (const status of ["PENDING_REVIEW", "DRAFT", "RESOLVED", "REJECTED"] as const) {
      expect(isHappeningNow({ status, occurredAt: at(0.5), endedAt: null }, NOW)).toBe(
        false,
      );
    }
    expect(
      isHappeningNow({ status: "PUBLISHED", occurredAt: at(0.5), endedAt: at(0.1) }, NOW),
    ).toBe(false);
  });
});

describe("canMarkOver", () => {
  it("is offered on a published or queued report inside the window", () => {
    expect(
      canMarkOver({ status: "PENDING_REVIEW", occurredAt: at(1), endedAt: null }, NOW),
    ).toBe(true);
    expect(
      canMarkOver({ status: "PUBLISHED", occurredAt: at(1), endedAt: null }, NOW),
    ).toBe(true);
  });

  it("is not offered twice, outside the window, or on a closed report", () => {
    expect(
      canMarkOver({ status: "PUBLISHED", occurredAt: at(1), endedAt: at(0.5) }, NOW),
    ).toBe(false);
    expect(
      canMarkOver({ status: "PUBLISHED", occurredAt: at(5), endedAt: null }, NOW),
    ).toBe(false);
    for (const status of ["RESOLVED", "REJECTED", "ARCHIVED"] as const) {
      expect(canMarkOver({ status, occurredAt: at(1), endedAt: null }, NOW)).toBe(false);
    }
  });
});

describe("reportBannerKind", () => {
  it("maps every status to one banner", () => {
    const base = { occurredAt: at(10), endedAt: null };
    expect(reportBannerKind({ ...base, status: "DRAFT" }, NOW)).toBe("in_review");
    expect(reportBannerKind({ ...base, status: "PENDING_REVIEW" }, NOW)).toBe("in_review");
    expect(reportBannerKind({ ...base, status: "PUBLISHED" }, NOW)).toBe("published");
    expect(reportBannerKind({ ...base, status: "RESOLVED" }, NOW)).toBe("resolved");
    expect(reportBannerKind({ ...base, status: "REJECTED" }, NOW)).toBe("rejected");
    expect(reportBannerKind({ ...base, status: "ARCHIVED" }, NOW)).toBe("archived");
  });

  it("prefers happening now to published, and drops it once ended", () => {
    expect(
      reportBannerKind({ status: "PUBLISHED", occurredAt: at(1), endedAt: null }, NOW),
    ).toBe("happening_now");
    expect(
      reportBannerKind({ status: "PUBLISHED", occurredAt: at(1), endedAt: at(0.2) }, NOW),
    ).toBe("published");
  });
});
