import { prisma } from "@/lib/prisma";
import type { VillageInterestRole } from "@/generated/prisma/enums";
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

/**
 * Every registration, grouped by village, most interest first.
 *
 * **Degrades to an empty list rather than throwing**, the rule every read on a
 * new table in this codebase follows. `20260913090000_village_interest` may not
 * be applied, and this renders inside `/admin/villages` — a page an
 * administrator uses to activate villages, which must not go down because an
 * optional pipeline section could not be counted.
 *
 * Unbounded on purpose, and that is a decision with a ceiling behind it rather
 * than an oversight: the rate limit in front of the route is five an hour per
 * address, and a list this is too long to render is a problem worth having and
 * worth noticing. Add a cap when somebody has seen it.
 */
export async function listVillageInterest(): Promise<VillageInterestGroup[]> {
  let rows: (VillageInterestEntry & { villageName: string })[];

  try {
    rows = await prisma.villageInterest.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        villageName: true,
        county: true,
        role: true,
        motivation: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  } catch (cause) {
    console.error("Could not read village interest registrations", cause);
    return [];
  }

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
  return [...groups.values()].sort(
    (a, b) =>
      Number(b.coordinatorCandidates > 0) - Number(a.coordinatorCandidates > 0) ||
      b.total - a.total ||
      a.villageName.localeCompare(b.villageName, "en-GB"),
  );
}
