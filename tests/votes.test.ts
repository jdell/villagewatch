import { describe, expect, it } from "vitest";
import {
  EMPTY_TALLY,
  MIN_VOTES_TO_FEATURE,
  applyVote,
  byConcern,
  concerning,
  nextVote,
  summariseVotes,
  tally,
  tallyFor,
  toVoteDirection,
  toVoteInput,
  type VoteState,
  type VoteTally,
} from "@/lib/votes";

/**
 * The vote rules, which are shared between the browser and the route and are
 * therefore the one place a disagreement would show up as a number that flicks
 * to the wrong value and then corrects itself.
 *
 * What is asserted here is the four things that make the feature what it is:
 *
 *   * **the toggle** — pressing the button you already pressed removes your
 *     vote, because "no opinion" is the absence of a row rather than a third
 *     enum value;
 *   * **the optimistic tally agrees with the toggle**, because `applyVote` is
 *     derived from `nextVote` rather than reimplementing it. A test that
 *     asserted each separately would pass on two implementations that disagree;
 *   * **the ordering**, including the tiebreak that separates a report nobody
 *     voted on from one the village argued over — both score zero, and only one
 *     of them is worth a coordinator's attention;
 *   * **the threshold**, which is what stops one neighbour's nudge leading a
 *     section in a document addressed to a police officer.
 *
 * No database and no secret: `votes.ts` is client-safe by construction, which
 * is the property that lets the button and the server run the same code.
 */

const state = (
  up: number,
  down: number,
  myVote: VoteState["myVote"] = null,
): VoteState => ({ ...tally(up, down), myVote });

describe("the wire format", () => {
  it("narrows the two values it accepts and nothing else", () => {
    expect(toVoteDirection("up")).toBe("UP");
    expect(toVoteDirection("down")).toBe("DOWN");

    // Everything a hand-made POST could carry. Null is what turns each of these
    // into a 422 rather than a Prisma error.
    for (const junk of ["UP", "sideways", "", 1, true, null, undefined, {}]) {
      expect(toVoteDirection(junk)).toBeNull();
    }
  });

  it("round-trips a direction back to what the browser sent", () => {
    expect(toVoteInput(toVoteDirection("up"))).toBe("up");
    expect(toVoteInput(toVoteDirection("down"))).toBe("down");
    expect(toVoteInput(null)).toBeNull();
  });
});

describe("nextVote", () => {
  it("creates a vote where there was none", () => {
    expect(nextVote(null, "UP")).toEqual({ action: "create", vote: "UP" });
    expect(nextVote(null, "DOWN")).toEqual({ action: "create", vote: "DOWN" });
  });

  it("deletes the vote when the same button is pressed again", () => {
    // The whole reason there is no NEUTRAL: this is how "no opinion" is spelled.
    expect(nextVote("UP", "UP")).toEqual({ action: "delete", vote: null });
    expect(nextVote("DOWN", "DOWN")).toEqual({ action: "delete", vote: null });
  });

  it("moves the vote rather than adding a second one", () => {
    expect(nextVote("UP", "DOWN")).toEqual({ action: "update", vote: "DOWN" });
    expect(nextVote("DOWN", "UP")).toEqual({ action: "update", vote: "UP" });
  });
});

describe("applyVote", () => {
  it("adds a vote a resident has not cast", () => {
    expect(applyVote(state(3, 1), "up")).toEqual({
      up: 4,
      down: 1,
      score: 3,
      myVote: "up",
    });
  });

  it("removes the vote when the same button is pressed again", () => {
    expect(applyVote(state(4, 1, "up"), "up")).toEqual({
      up: 3,
      down: 1,
      score: 2,
      myVote: null,
    });
  });

  it("moves a vote across in one step, never counting it twice", () => {
    // The case a naive "increment the other side" would get wrong: the up count
    // has to come down as the down count goes up, so a village of one resident
    // changing their mind is 0/1 and never 1/1.
    expect(applyVote(state(1, 0, "up"), "down")).toEqual({
      up: 0,
      down: 1,
      score: -1,
      myVote: "down",
    });
  });

  it("returns to where it started after a full circuit", () => {
    // up → down → down again. The optimistic path has to be reversible, because
    // it is what the button puts back when the request fails.
    const start = state(2, 2);
    const round = applyVote(applyVote(applyVote(start, "up"), "down"), "down");

    expect(round).toEqual(start);
  });

  it("never goes negative", () => {
    // Reachable from a stale page: the reader's own vote was deleted elsewhere
    // — another device, or an erasure — and the count on screen is behind.
    expect(applyVote(state(0, 0, "up"), "up")).toEqual({
      up: 0,
      down: 0,
      score: 0,
      myVote: null,
    });
  });
});

describe("summariseVotes", () => {
  const rows = [
    { incidentId: "a", vote: "UP" as const, _count: { _all: 4 } },
    { incidentId: "a", vote: "DOWN" as const, _count: { _all: 1 } },
    { incidentId: "b", vote: "DOWN" as const, _count: { _all: 2 } },
  ];

  it("folds the two rows per incident into one tally", () => {
    const tallies = summariseVotes(rows);

    expect(tallies.get("a")).toEqual({ up: 4, down: 1, score: 3 });
    expect(tallies.get("b")).toEqual({ up: 0, down: 2, score: -2 });
  });

  it("leaves out incidents nobody voted on, and `tallyFor` decides that case", () => {
    const tallies = summariseVotes(rows);

    expect(tallies.has("c")).toBe(false);
    expect(tallyFor(tallies, "c")).toEqual(EMPTY_TALLY);
  });
});

describe("byConcern", () => {
  const item = (id: string, votes: VoteTally) => ({ id, votes });

  it("puts the highest net score first", () => {
    const ordered = byConcern(
      [
        item("low", tally(1, 0)),
        item("high", tally(9, 2)),
        item("mid", tally(4, 1)),
      ],
      (row) => row.votes,
    );

    expect(ordered.map((row) => row.id)).toEqual(["high", "mid", "low"]);
  });

  it("separates an argued-over report from one nobody voted on", () => {
    // Both score zero. The second is the one a coordinator wants to look at,
    // and a comparator that stopped at `score` would order them arbitrarily.
    const ordered = byConcern(
      [item("silent", tally(0, 0)), item("argued", tally(4, 4))],
      (row) => row.votes,
    );

    expect(ordered.map((row) => row.id)).toEqual(["argued", "silent"]);
  });

  it("leaves the caller's order alone where the votes tie exactly", () => {
    // Stable sort. Every caller hands this `occurredAt` descending, so a period
    // with no votes in it comes out as it went in rather than shuffled.
    const ordered = byConcern(
      [
        item("first", tally(2, 1)),
        item("second", tally(2, 1)),
        item("third", tally(2, 1)),
      ],
      (row) => row.votes,
    );

    expect(ordered.map((row) => row.id)).toEqual(["first", "second", "third"]);
  });

  it("does not sort the array it was given", () => {
    const rows = [item("a", tally(0, 0)), item("b", tally(5, 0))];
    byConcern(rows, (row) => row.votes);

    expect(rows.map((row) => row.id)).toEqual(["a", "b"]);
  });
});

describe("concerning", () => {
  const item = (id: string, votes: VoteTally) => ({ id, votes });

  it("drops a report one neighbour nudged", () => {
    // The threshold exists for the document this feeds: a "most concerning"
    // section in a report to a PCSO, topped by a single tap, would be putting a
    // claim in the village's mouth that the village did not make.
    expect(MIN_VOTES_TO_FEATURE).toBeGreaterThan(1);

    const featured = concerning(
      [item("one-tap", tally(1, 0)), item("real", tally(3, 0))],
      (row) => row.votes,
      5,
    );

    expect(featured.map((row) => row.id)).toEqual(["real"]);
  });

  it("drops a report the village rated down", () => {
    // "Most concerning" means concerning. A net-negative report belongs in the
    // dashboard's "rated less serious" ordering, not in a police document.
    const featured = concerning(
      [item("overstated", tally(1, 4)), item("even", tally(2, 2))],
      (row) => row.votes,
      5,
    );

    expect(featured).toEqual([]);
  });

  it("honours the limit", () => {
    const featured = concerning(
      [
        item("a", tally(9, 0)),
        item("b", tally(8, 0)),
        item("c", tally(7, 0)),
      ],
      (row) => row.votes,
      2,
    );

    expect(featured.map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("is empty in a village where nobody has voted, which omits the section", () => {
    expect(concerning([item("a", EMPTY_TALLY)], (row) => row.votes, 5)).toEqual(
      [],
    );
  });
});
