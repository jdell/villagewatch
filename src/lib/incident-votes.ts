import { prisma } from "@/lib/prisma";
import {
  EMPTY_TALLY,
  summariseVotes,
  toVoteInput,
  type VoteState,
  type VoteTally,
} from "@/lib/votes";

/**
 * Reading the village's votes. **Server only** — it goes through Prisma.
 *
 * The other half of `src/lib/votes.ts`, which is client-safe and holds the
 * toggle rule, the tally arithmetic and the ordering. The split is the one
 * `police-api.ts` / `police-data.ts` / `police-report.ts` uses and it is there
 * for the same reason: the browser needs the rules, the server needs the rows,
 * and a single module would drag Prisma into a Client Component's bundle.
 *
 * ## Every read degrades rather than throws
 *
 * `incident_votes` arrives with `20260823120000_incident_votes`, which a
 * deployment may not have applied — the same state `getVillagePoliceComparison`
 * handles for its three tables, handled the same way. **This one matters more
 * than that one did.** The police figures are an enrichment on two screens; the
 * vote buttons are on every published report, so an exception here would take
 * out the incident list, the detail page, the dashboard and the report at once,
 * for an optional feature. A village on a database that is behind sees no vote
 * counts, which is exactly what a village where nobody has voted sees.
 *
 * ## Nobody's identity comes back
 *
 * Neither function returns a voter. `readVoteStates` takes one user id and
 * answers only for *that* user, which is the reader's own vote and is what the
 * button needs to draw itself; `readVoteTallies` returns counts. There is no
 * function here — and no query anywhere in the app — that answers "who voted on
 * this", which is what makes the promise in `IncidentVote`'s schema comment
 * structural rather than a matter of remembering.
 */

/**
 * Postgres `42P01` — undefined table — however Prisma happens to surface it.
 *
 * The sibling of `isMissingPoliceTable`, matched just as narrowly and for the
 * same reason: a broad catch would swallow an unreachable database and render a
 * page that quietly claims nobody has voted when what is actually missing is
 * the connection.
 */
function isMissingVoteTable(cause: unknown): boolean {
  if (typeof cause !== "object" || cause === null) return false;

  const code = (cause as { code?: unknown }).code;
  if (code === "P2021" || code === "42P01") return true;

  const message = (cause as { message?: unknown }).message;
  return typeof message === "string" && message.includes("incident_votes");
}

/** Runs a read, and answers `fallback` if the table is not there yet. */
async function tolerant<T>(read: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await read();
  } catch (cause) {
    if (isMissingVoteTable(cause)) {
      console.warn(
        "The incident_votes table is missing — has " +
          "20260823120000_incident_votes been applied? Rendering without votes.",
      );
      return fallback;
    }

    // An unreachable database is not the same problem as an unapplied
    // migration, and the page above can do something about the first.
    throw cause;
  }
}

/**
 * The tally for each of a set of reports.
 *
 * One `groupBy` for the whole page rather than one query per card — the same
 * shape `signedMediaUrls` takes for thumbnails, and for the same reason: a list
 * of thirty reports should cost one round trip.
 *
 * Reports nobody has voted on are absent from the map rather than present with
 * zeroes. Callers go through `tallyFor`, which decides the empty case once.
 */
export async function readVoteTallies(
  incidentIds: readonly string[],
): Promise<Map<string, VoteTally>> {
  if (incidentIds.length === 0) return new Map();

  return tolerant(async () => {
    const rows = await prisma.incidentVote.groupBy({
      by: ["incidentId", "vote"],
      where: { incidentId: { in: [...incidentIds] } },
      _count: { _all: true },
    });

    return summariseVotes(rows);
  }, new Map());
}

/**
 * The tally for each of a set of reports, plus how one reader voted on each.
 *
 * Two queries, in parallel: the counts for everybody and this reader's own
 * rows. Deliberately not one query with a conditional aggregate — the counts
 * are an aggregate over the whole village and the reader's vote is a lookup of
 * at most `incidentIds.length` rows, and expressing both as one statement in
 * Prisma means `$queryRaw` and a hand-written `IN` list for a page that is
 * already fast.
 *
 * `userId` is the Supabase auth user id, which is `User.id` and
 * `IncidentVote.userId`. Passing null — a session with no profile — returns the
 * tallies with `myVote: null` throughout, which is the right rendering for
 * somebody who cannot vote anyway.
 */
export async function readVoteStates(input: {
  incidentIds: readonly string[];
  userId: string | null;
}): Promise<Map<string, VoteState>> {
  const { incidentIds, userId } = input;

  if (incidentIds.length === 0) return new Map();

  return tolerant(async () => {
    const ids = [...incidentIds];

    const [rows, mine] = await Promise.all([
      prisma.incidentVote.groupBy({
        by: ["incidentId", "vote"],
        where: { incidentId: { in: ids } },
        _count: { _all: true },
      }),
      userId
        ? prisma.incidentVote.findMany({
            where: { incidentId: { in: ids }, userId },
            select: { incidentId: true, vote: true },
          })
        : Promise.resolve([]),
    ]);

    const tallies = summariseVotes(rows);
    const own = new Map(mine.map((row) => [row.incidentId, row.vote]));

    // Keyed off the requested ids rather than off the rows, so every card on
    // the page gets a state — including the ones nobody has voted on, which is
    // most of them in a village that has just switched this on.
    return new Map(
      ids.map((id) => [
        id,
        {
          ...(tallies.get(id) ?? EMPTY_TALLY),
          myVote: toVoteInput(own.get(id) ?? null),
        },
      ]),
    );
  }, new Map());
}
