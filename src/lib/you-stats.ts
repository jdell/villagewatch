import { prisma } from "@/lib/prisma";

/**
 * The three figures on the profile card. Server only, and each degrades to null
 * on its own rather than taking "You" down — a missing figure is a dash.
 *
 * - **Reports filed** — this resident's reports, every status but `REMOVED`
 *   (an erased report is gone, including from their own count).
 * - **Rated** — the reports they have voted on. The design calls this
 *   "witnessed", and nothing in the app records a witness: the corroboration
 *   feature is a proposal, not a table. The vote is the one act a resident
 *   takes on somebody else's report, so it is counted and named for what it is.
 * - **Days a member** — from the profile row's `createdAt`, because "days
 *   active" would need `User.lastActiveAt`, which nothing writes.
 *
 * All three are the resident's own and nobody else's — the card is on their
 * own screen and the queries are keyed on the session user id.
 */
export type YouStats = {
  reportsFiled: number | null;
  rated: number | null;
};

async function orNull<T>(read: Promise<T>, what: string): Promise<T | null> {
  try {
    return await read;
  } catch (cause) {
    console.warn("[you-stats] could not count %s", what, cause);
    return null;
  }
}

export async function readYouStats(userId: string): Promise<YouStats> {
  const [reportsFiled, rated] = await Promise.all([
    orNull(
      prisma.incident.count({
        where: { reporterId: userId, status: { not: "REMOVED" } },
      }),
      "reports",
    ),
    orNull(prisma.incidentVote.count({ where: { userId } }), "votes"),
  ]);

  return { reportsFiled, rated };
}
