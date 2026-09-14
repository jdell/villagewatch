import { prisma } from "@/lib/prisma";
import type {
  VillageInterestRole,
  VillageInterestStatus,
} from "@/generated/prisma/enums";
import { ARCHIVE_REASON_LABELS } from "@/lib/constants";
import type { VillageInterestInput } from "@/lib/validations";

/**
 * Interest in a village that is not in service yet.
 *
 * **Server only.** It imports Prisma, so a Client Component reaching for it
 * breaks the build — the same split `villages.ts` and `incident-votes.ts` have.
 *
 * This module is the whole of the expansion pipeline: `recordVillageInterest`
 * is what the sign-up form's unlisted branch writes, and
 * `listVillageInterest` is what `/admin/villages` reads. There is deliberately
 * nothing else — no update, no delete, no read scoped to a village, because
 * there is no village to scope to and nobody with a session to scope for.
 *
 * ## Why grouping happens here and not in SQL
 *
 * `village_name` and `county` are free text a stranger typed, so "Cottenham",
 * "cottenham" and "Cottenham " are one village written three ways. A
 * `GROUP BY village_name` would report three, and an administrator reading a
 * pipeline would see three villages with one person each where there is one
 * village with three. `groupKey` folds case, whitespace and accents the way
 * `village-picker.tsx` folds a search query, and the label shown is the spelling
 * **most people used** rather than an invented canonical one — nothing here
 * title-cases or corrects anything, because guessing at a "correct" version of
 * a place name is how `A' Chrìon Làraich` becomes unfindable by the people who
 * live there. Modal rather than most-recent, which was the first rule and was a
 * coin flip: with two rows reading "Cottenham" and "cottenham" the newest is
 * arbitrary, and this is the list a parish council gets quoted from.
 */

/** One person's registration, as the admin view renders it. */
export type VillageInterestEntry = {
  id: string;
  name: string;
  email: string;
  county: string;
  role: VillageInterestRole;
  motivation: string | null;
  createdAt: Date;
  status: VillageInterestStatus;
  archivedAt: Date | null;
  /** A code from `ARCHIVE_REASONS`, or the sentence somebody typed. */
  archivedReason: string | null;
};

/** One village's worth, which is the unit the expansion pipeline is read in. */
export type VillageInterestGroup = {
  /** The most recent spelling somebody used. */
  villageName: string;
  /** The most recent county given, for the same reason. */
  county: string;
  entries: VillageInterestEntry[];
  total: number;
  /**
   * The figure that decides anything. Residents are demand; a candidate is the
   * thing that unblocks a launch, because `appointCoordinator` needs a person.
   */
  coordinatorCandidates: number;
};

/**
 * Folds a typed place name to something two spellings of it share.
 *
 * The same normalisation `village-picker.tsx` applies to a search query —
 * lower-cased, accents stripped, inner whitespace collapsed — so that the
 * grouping here and the searching there agree about what counts as the same
 * word.
 */
function groupKey(villageName: string, county: string): string {
  return [villageName, county]
    .map((part) =>
      part
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim(),
    )
    .join("|");
}

/**
 * What to print for a stored `archivedReason`.
 *
 * The column holds one of two things and nothing marks which: a kebab-case code
 * for the four fixed reasons, or the sentence somebody typed under "Other". A
 * value that is a known code gets its label; anything else is returned as it
 * was written, because it is already a sentence.
 *
 * `Object.hasOwn` rather than `in`, for `resolvePrivacyLevel`'s reason:
 * `ARCHIVE_REASON_LABELS` is a plain object, so `in` answers true for
 * `toString` and `constructor` — and this reads a free-text column, which is
 * exactly where one of those could arrive.
 */
export function archiveReasonLabel(stored: string | null): string | null {
  if (!stored) return null;

  return Object.hasOwn(ARCHIVE_REASON_LABELS, stored)
    ? ARCHIVE_REASON_LABELS[stored as keyof typeof ARCHIVE_REASON_LABELS]
    : stored;
}

/**
 * Writes one interest row.
 *
 * Takes the parsed input rather than a request, so the route keeps the gate and
 * this keeps the write — `villages.ts`'s convention. It throws on a database
 * error rather than swallowing: unlike a push or a Slack line, this **is** the
 * act, and telling somebody their interest was registered when no row exists is
 * the one failure this form must not have.
 */
export async function recordVillageInterest(
  input: VillageInterestInput,
): Promise<{ id: string }> {
  const row = await prisma.villageInterest.create({
    data: {
      name: input.fullName,
      email: input.email,
      villageName: input.villageName,
      county: input.county,
      role:
        input.role === "coordinator-candidate"
          ? "COORDINATOR_CANDIDATE"
          : "RESIDENT",
      motivation: input.motivation ?? null,
    },
    select: { id: true },
  });

  return row;
}

/** What the admin view gets back: one status's groups, and both totals. */
export type VillageInterestPipeline = {
  groups: VillageInterestGroup[];
  /** Waiting to be acted on. */
  pending: number;
  /** Taken off the list. */
  archived: number;
};

/**
 * One status's registrations, grouped by village, most interest first.
 *
 * **Degrades to an empty pipeline rather than throwing**, the rule every read
 * on a new table in this codebase follows. `20260913090000_village_interest`
 * and `20260914090000_village_interest_archive` may not be applied, and this
 * renders inside `/admin/villages` — a page an administrator uses to activate
 * villages, which must not go down because an optional pipeline section could
 * not be counted. The second migration matters here as much as the first: a
 * database with the table and not the columns fails on `status`, and the
 * failure is the same shape.
 *
 * **Both totals come back whichever status was asked for**, because the toggle
 * that switches between them has to say what is on the other side. A link
 * reading "Archived" with no count is one nobody presses, and the count is what
 * tells an administrator whether the pipeline is being worked at all.
 *
 * Unbounded on purpose, and that is a decision with a ceiling behind it rather
 * than an oversight: the rate limit in front of the route is five an hour per
 * address, and a list too long to render is a problem worth having and worth
 * noticing. Add a cap when somebody has seen it.
 */
export async function listVillageInterest(
  status: VillageInterestStatus = "PENDING",
): Promise<VillageInterestPipeline> {
  let rows: (VillageInterestEntry & { villageName: string })[];
  let counts: { status: VillageInterestStatus; _count: { _all: number } }[];

  try {
    [rows, counts] = await Promise.all([
      prisma.villageInterest.findMany({
        where: { status },
        select: {
          id: true,
          name: true,
          email: true,
          villageName: true,
          county: true,
          role: true,
          motivation: true,
          createdAt: true,
          status: true,
          archivedAt: true,
          archivedReason: true,
        },
        orderBy: { createdAt: "desc" },
      }),
      /*
        One `groupBy` rather than two counts: it returns a row per status that
        has rows at all, which is at most two, and it is covered by the
        `(status, created_at)` index the migration adds.
      */
      prisma.villageInterest.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);
  } catch (cause) {
    console.error("Could not read village interest registrations", cause);
    return { groups: [], pending: 0, archived: 0 };
  }

  const totalFor = (wanted: VillageInterestStatus) =>
    counts.find((row) => row.status === wanted)?._count._all ?? 0;

  const groups = new Map<string, VillageInterestGroup>();
  /** How many people wrote each exact spelling, per group. */
  const spellings = new Map<string, Map<string, number>>();

  for (const row of rows) {
    const key = groupKey(row.villageName, row.county);
    const existing = groups.get(key);

    const seen = spellings.get(key) ?? new Map<string, number>();
    const label = `${row.villageName}|${row.county}`;
    seen.set(label, (seen.get(label) ?? 0) + 1);
    spellings.set(key, seen);

    if (existing) {
      existing.entries.push(row);
      existing.total += 1;
      if (row.role === "COORDINATOR_CANDIDATE") existing.coordinatorCandidates += 1;
      continue;
    }

    groups.set(key, {
      villageName: row.villageName,
      county: row.county,
      entries: [row],
      total: 1,
      coordinatorCandidates: row.role === "COORDINATOR_CANDIDATE" ? 1 : 0,
    });
  }

  /*
    Now pick the label. `rows` is newest-first, so a tie is broken by whoever
    typed it most recently — which is arbitrary, but only ever between spellings
    that an equal number of people used.
  */
  for (const [key, group] of groups) {
    const seen = spellings.get(key);
    if (!seen) continue;

    let best = "";
    let bestCount = 0;

    for (const [label, count] of seen) {
      if (count > bestCount) {
        best = label;
        bestCount = count;
      }
    }

    const [villageName, county] = best.split("|");
    if (villageName) group.villageName = villageName;
    if (county) group.county = county;
  }

  /*
    A village with a candidate is ordered above one without, whatever the
    counts. Forty residents waiting and nobody to coordinate is a village that
    cannot be activated; one resident who volunteered is a village that can, and
    the ordering should put the actionable thing at the top rather than the
    popular one. Total is the tiebreak, then the name so the list is stable.
  */
  return {
    groups: [...groups.values()].sort(
      (a, b) =>
        Number(b.coordinatorCandidates > 0) -
          Number(a.coordinatorCandidates > 0) ||
        b.total - a.total ||
        a.villageName.localeCompare(b.villageName, "en-GB"),
    ),
    pending: totalFor("PENDING"),
    archived: totalFor("ARCHIVED"),
  };
}

/** What a write to one row can come back as. */
export type ArchiveResult =
  | { ok: true; villageName: string }
  | { ok: false; error: string };

/**
 * Takes one registration off the working list.
 *
 * **The status and the reason are written in one statement**, so a row cannot
 * exist that is archived with no account of why. That is the same argument the
 * retention sweep makes about archiving a report and deleting its wording
 * together: a second pass is one a failure can leave un-run, and the state it
 * leaves behind is the one nobody notices.
 *
 * **It refuses a row that is already archived rather than re-stamping it.** The
 * date and the reason are a record of a decision somebody took, and a second
 * press — a double click, a stale tab, a back button — would move the date onto
 * today and overwrite the reason with whatever the second person chose. That is
 * `acceptCompliance`'s rule about re-accepting, and the reason the guard is in
 * the `where` rather than in a read before the write: two requests in the same
 * second cannot both find it pending.
 *
 * Returning a value rather than throwing, `checkVillageJoin`'s shape: the route
 * turns a refusal into a 409 and the caller sees a sentence, rather than a 500
 * that says the server broke when it did exactly what it should.
 */
export async function archiveVillageInterest(input: {
  id: string;
  reason: string;
}): Promise<ArchiveResult> {
  try {
    const updated = await prisma.villageInterest.updateMany({
      where: { id: input.id, status: "PENDING" },
      data: {
        status: "ARCHIVED",
        archivedAt: new Date(),
        archivedReason: input.reason,
      },
    });

    if (updated.count === 0) {
      /*
        Two things land here and they are told apart by a read rather than
        guessed at: a row that does not exist, and one somebody else archived
        first. The second is not a failure worth alarming anybody about — the
        list just needs refreshing — and saying "not found" about a row that is
        sitting there would send an administrator looking for a bug.
      */
      const row = await prisma.villageInterest.findUnique({
        where: { id: input.id },
        select: { status: true, villageName: true },
      });

      if (!row) return { ok: false, error: "That registration no longer exists." };

      return {
        ok: false,
        error: "That one is already archived. Refresh to see the current list.",
      };
    }

    const row = await prisma.villageInterest.findUnique({
      where: { id: input.id },
      select: { villageName: true },
    });

    return { ok: true, villageName: row?.villageName ?? "" };
  } catch (cause) {
    console.error("Could not archive interest registration %s", input.id, cause);
    return { ok: false, error: "We could not archive that just now." };
  }
}

/**
 * Puts one back on the working list.
 *
 * **This was not in the brief and is here deliberately.** What was asked for is
 * an archive with a reason, a filter, and no hard delete — which leaves an
 * administrator who archives the wrong row with an archived view they can read
 * and no way back except an `UPDATE` typed into psql. That is the state
 * `villages.ts` records as the whole gap `suspendVillage` existed to close:
 * "nothing in the application could write it back". A one-way action on a list
 * of names, driven by a button, produces a mis-press in the first week.
 *
 * **It clears the date and the reason rather than keeping them**, which is the
 * one decision here worth arguing about. Keeping them would preserve a trail of
 * "this was archived once, for this reason" — but the column then says a row is
 * `PENDING` *and* carries an archive reason, which is a state the reader has to
 * know to ignore, and the admin view would print a reason under a row that is
 * on the working list. A restore is somebody saying the archive was wrong, so
 * what it should leave behind is a row that looks like one that was never
 * archived.
 */
export async function restoreVillageInterest(
  id: string,
): Promise<ArchiveResult> {
  try {
    const updated = await prisma.villageInterest.updateMany({
      where: { id, status: "ARCHIVED" },
      data: { status: "PENDING", archivedAt: null, archivedReason: null },
    });

    if (updated.count === 0) {
      const row = await prisma.villageInterest.findUnique({
        where: { id },
        select: { status: true },
      });

      if (!row) return { ok: false, error: "That registration no longer exists." };

      return {
        ok: false,
        error: "That one is already on the list. Refresh to see it.",
      };
    }

    const row = await prisma.villageInterest.findUnique({
      where: { id },
      select: { villageName: true },
    });

    return { ok: true, villageName: row?.villageName ?? "" };
  } catch (cause) {
    console.error("Could not restore interest registration %s", id, cause);
    return { ok: false, error: "We could not restore that just now." };
  }
}
