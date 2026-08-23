import type { VoteDirection } from "@/generated/prisma/enums";

/**
 * How a village rates the seriousness of a report it can already see.
 *
 * **Client-safe**, and that is load-bearing rather than tidy — the same import
 * budget `format-alert.ts`, `community-report.ts` and `date-range.ts` keep. It
 * imports one enum as a *type* and nothing else: no Prisma client, no
 * `node:crypto`, no secret. `VoteButtons` runs the toggle in the browser to
 * update the count before the request lands, and
 * `POST /api/incidents/[id]/vote` runs the same function on the server to
 * decide what to write. Two copies of that rule would disagree the first time
 * somebody fixed one, and the symptom would be a count that flicks to the wrong
 * number and then corrects itself.
 *
 * ## What a vote is, and what it is not
 *
 * `Incident.severity` is the reporter's own assessment of what they saw,
 * sharpened by the AI pass. This is the village's, and it is deliberately
 * **advisory**: nothing here writes a status, moves a severity, publishes
 * anything or sends an alert. What it produces is an *ordering* — on the
 * coordinator's dashboard, and in the "most concerning" section of the document
 * that goes to a PCSO — so that the people deciding what to act on can see what
 * their neighbours actually think.
 *
 * A vote that moved severity automatically would be a different feature and a
 * worse one. Severity drives the push audience (`notifyMinSeverity`) and the
 * WhatsApp Channel's floor (`whatsappMinSeverity`), so a handful of taps would
 * decide who gets woken up — and the obvious failure is not malice but a
 * popular report about a lost dog outranking an unpopular one about a
 * neighbour.
 *
 * ## Voting is a toggle, and there is no neutral
 *
 * Three states — up, down, and no opinion — and the third is the **absence of a
 * row**. Pressing the button you already pressed deletes it. A `NEUTRAL` enum
 * value would be a second way to spell the same thing, and every tally in the
 * codebase would have to remember to exclude it.
 */

export type { VoteDirection };

/**
 * The value the API takes and the browser sends.
 *
 * Lowercase because it is a request body rather than a database enum, and the
 * two are converted at the edge by {@link toVoteDirection}. Keeping the wire
 * format distinct from the column is what stops a client's typo becoming a
 * Prisma error rather than a 422.
 */
export type VoteInput = "up" | "down";

export const VOTE_INPUTS = ["up", "down"] as const satisfies readonly VoteInput[];

/** `"up"` → `"UP"`, and null for anything that is not one of the two. */
export function toVoteDirection(value: unknown): VoteDirection | null {
  if (value === "up") return "UP";
  if (value === "down") return "DOWN";
  return null;
}

/** `"UP"` → `"up"`. The inverse, for a response the browser reads back. */
export function toVoteInput(value: VoteDirection | null): VoteInput | null {
  if (value === "UP") return "up";
  if (value === "DOWN") return "down";
  return null;
}

/**
 * What the village thinks of one report.
 *
 * `score` is carried rather than derived at every call site because it is what
 * two orderings sort on — the dashboard's concern list and the report's "most
 * concerning" section — and a sort key computed in two places is a sort key
 * that will one day disagree with the number printed beside it.
 */
export type VoteTally = {
  up: number;
  down: number;
  /** `up - down`. Negative is a village saying a report was overstated. */
  score: number;
};

/** What a report with nobody's opinion on it looks like. Never null. */
export const EMPTY_TALLY: VoteTally = { up: 0, down: 0, score: 0 };

/** A tally plus how the resident looking at it voted, if they did. */
export type VoteState = VoteTally & {
  /** Null when this resident has not voted. Never another resident's vote. */
  myVote: VoteInput | null;
};

export function tally(up: number, down: number): VoteTally {
  const safeUp = Math.max(0, up);
  const safeDown = Math.max(0, down);
  return { up: safeUp, down: safeDown, score: safeUp - safeDown };
}

/**
 * What pressing a button does to a vote that already exists.
 *
 * The whole toggle rule, in one place, used by the route to decide what to
 * write and by the button to decide what to draw:
 *
 * - nothing there, press either → **create** it;
 * - the same one again → **delete** it, which is how "no opinion" is spelled;
 * - the other one → **update** it, so a resident who changes their mind is one
 *   row rather than two.
 */
export function nextVote(
  current: VoteDirection | null,
  pressed: VoteDirection,
): { action: "create" | "update" | "delete"; vote: VoteDirection | null } {
  if (current === null) return { action: "create", vote: pressed };
  if (current === pressed) return { action: "delete", vote: null };
  return { action: "update", vote: pressed };
}

/**
 * The tally after a press, without asking the server.
 *
 * What makes the button feel instant — and what makes it *correct* when the
 * request then fails, because the component keeps the previous state and puts
 * it back. Derived from `nextVote` rather than reimplementing the toggle, so
 * the optimistic count and the row that gets written cannot disagree.
 */
export function applyVote(state: VoteState, pressed: VoteInput): VoteState {
  const current = toVoteDirection(state.myVote);
  const direction = toVoteDirection(pressed);

  // Unreachable from the component, which only ever passes one of the two.
  // Returning the state unchanged is the right answer for a value that means
  // nothing rather than throwing inside a click handler.
  if (!direction) return state;

  const next = nextVote(current, direction);

  let { up, down } = state;

  // Remove the old opinion, then add the new one. Written as two steps rather
  // than a table of six cases because the two steps are the rule: a resident
  // holds at most one vote, so a change is a removal and an addition.
  if (current === "UP") up -= 1;
  if (current === "DOWN") down -= 1;
  if (next.vote === "UP") up += 1;
  if (next.vote === "DOWN") down += 1;

  return { ...tally(up, down), myVote: toVoteInput(next.vote) };
}

/**
 * `groupBy(["incidentId", "vote"])` rows → one tally per incident.
 *
 * Two rows per incident at most, and often one. Incidents nobody has voted on
 * are absent from the result rather than present with zeroes — callers reach
 * for {@link tallyFor}, which is where the empty case is decided once.
 */
export function summariseVotes(
  rows: readonly {
    incidentId: string;
    vote: VoteDirection;
    _count: { _all: number };
  }[],
): Map<string, VoteTally> {
  const counts = new Map<string, { up: number; down: number }>();

  for (const row of rows) {
    const entry = counts.get(row.incidentId) ?? { up: 0, down: 0 };

    if (row.vote === "UP") entry.up += row._count._all;
    else entry.down += row._count._all;

    counts.set(row.incidentId, entry);
  }

  return new Map(
    [...counts].map(([id, entry]) => [id, tally(entry.up, entry.down)]),
  );
}

/** One incident's tally out of a map, or the empty one. */
export function tallyFor(
  tallies: ReadonlyMap<string, VoteTally>,
  incidentId: string,
): VoteTally {
  return tallies.get(incidentId) ?? EMPTY_TALLY;
}

/**
 * Orders reports by what the village made of them, most concerning first.
 *
 * `score` descending, then `up` descending, then the caller's own order — which
 * is `occurredAt` descending everywhere this is used, so a period with no votes
 * in it comes out exactly as it went in rather than in an arbitrary shuffle.
 * The `up` tiebreak is what separates a report nobody voted on (0/0) from one
 * six people argued about (4 up, 4 down): both score zero, and the second is
 * the one a coordinator wants to look at.
 *
 * Stable, because `Array.prototype.sort` has been required to be since ES2019
 * and every runtime this ships to implements it. A copy is returned rather than
 * sorting in place — the caller's array is usually a Prisma result somebody
 * else is also reading.
 */
export function byConcern<T>(
  items: readonly T[],
  tallyOf: (item: T) => VoteTally,
): T[] {
  return [...items].sort((a, b) => {
    const left = tallyOf(a);
    const right = tallyOf(b);

    return right.score - left.score || right.up - left.up;
  });
}

/**
 * Whether a report has enough of an opinion on it to be worth calling out.
 *
 * One vote is one neighbour, and a "most concerning" section in a document
 * addressed to a police officer, topped by a report a single person nudged, is
 * a claim about a village that the village did not make. Two is a low bar and
 * it is deliberately low — most villages are small, and a threshold that needed
 * a quorum would mean the section never appeared at all.
 */
export const MIN_VOTES_TO_FEATURE = 2;

/** Reports the village has actually weighed in on, most concerning first. */
export function concerning<T>(
  items: readonly T[],
  tallyOf: (item: T) => VoteTally,
  limit: number,
): T[] {
  return byConcern(
    items.filter((item) => {
      const votes = tallyOf(item);
      return votes.up + votes.down >= MIN_VOTES_TO_FEATURE && votes.score > 0;
    }),
    tallyOf,
  ).slice(0, limit);
}
