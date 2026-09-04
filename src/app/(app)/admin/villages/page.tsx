import type { Metadata } from "next";
import Link from "next/link";
import { GitMerge, Search, ShieldCheck } from "lucide-react";
import type { VillageStatus } from "@/generated/prisma/enums";
import {
  VillageCard,
  type AdminVillage,
} from "@/components/admin/village-card";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COORDINATOR_ROLES, VILLAGE_ADMIN_PAGE_SIZE } from "@/lib/constants";

export const metadata: Metadata = { title: "Villages" };

/**
 * Where a directory entry becomes a village somebody can actually join.
 *
 * **Not village-scoped**, like `/admin/coordinators` and for the same reason —
 * it is what *creates* the first coordinator's village, so scoping it to the
 * administrator's own would make it useless for the 10,670 seeded parishes that
 * contain nobody at all. `requireAdmin()` is the gate; `src/lib/villages.ts`
 * re-checks next to each privilege.
 *
 * Two tabs, because they answer different questions. **In service** is the
 * handful of villages actually running, and it is where the join code and the
 * coordinator live. **Directory** is the ONS import — 271 parishes today and
 * 10,670 once England is seeded — which is only ever useful searched, so it
 * says so rather than rendering an arbitrary alphabetical slice.
 *
 * The search is a plain GET form, like the incident list's filters: the query
 * lands in the URL, so an administrator can link somebody to a village they are
 * talking about, and the back button does what it looks like it does.
 */

const TABS = [
  { key: "active", label: "In service" },
  { key: "directory", label: "Directory" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTab(value: string | undefined): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

/**
 * The statuses each tab covers.
 *
 * `SUSPENDED` and `ARCHIVED` sit with the directory rather than with the live
 * villages: neither is joinable, both are places a village can be sent back to,
 * and grouping them with `PENDING` keeps "In service" answering exactly one
 * question — which villages are open right now.
 */
const TAB_STATUSES: Record<TabKey, VillageStatus[]> = {
  active: ["ACTIVE"],
  directory: ["PENDING", "SUSPENDED", "ARCHIVED"],
};

export default async function AdminVillagesPage({
  searchParams,
}: {
  // Next 16: `searchParams` is a Promise and has to be awaited.
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  await requireAdmin("/admin/villages");

  const { tab, q } = await searchParams;
  const active: TabKey = isTab(tab) ? tab : "active";
  const query = (q ?? "").trim();

  if (!process.env.DATABASE_URL) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-sm text-slate-500">
          The database is not configured on this deployment.
        </p>
      </div>
    );
  }

  // The directory is too big to render unsearched — see the empty state below.
  const browsable = active === "active" || query.length > 0;

  const where = {
    status: { in: TAB_STATUSES[active] },
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { slug: { contains: query, mode: "insensitive" as const } },
            { region: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [villages, total] = await Promise.all([
    browsable
      ? prisma.village.findMany({
          where,
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
            region: true,
            // Whether a code exists, never the code. `joinCode` is a credential
            // — it turns a stranger into a verified resident — and a page that
            // selected it would put it in the RSC payload of every render.
            // `src/lib/villages.ts` returns a freshly minted one exactly once.
            joinCode: true,
          },
          orderBy: [{ name: "asc" }],
          take: VILLAGE_ADMIN_PAGE_SIZE,
        })
      : [],
    browsable ? prisma.village.count({ where }) : 0,
  ]);

  const ids = villages.map((village) => village.id);

  // Two grouped queries rather than a `_count` per row: `_count` cannot carry a
  // `where` on the relation, and the coordinator figure is the one that matters
  // — an active village with none is a queue nobody can open.
  const [residentRows, coordinatorRows] = await Promise.all([
    ids.length
      ? prisma.user.groupBy({
          by: ["villageId"],
          where: { villageId: { in: ids }, deletedAt: null },
          _count: { _all: true },
        })
      : [],
    ids.length
      ? prisma.user.groupBy({
          by: ["villageId"],
          where: {
            villageId: { in: ids },
            deletedAt: null,
            role: { in: [...COORDINATOR_ROLES] },
          },
          _count: { _all: true },
        })
      : [],
  ]);

  const residents = new Map(
    residentRows.map((row) => [row.villageId, row._count._all]),
  );
  const coordinators = new Map(
    coordinatorRows.map((row) => [row.villageId, row._count._all]),
  );

  const rows: AdminVillage[] = villages.map((village) => ({
    id: village.id,
    name: village.name,
    slug: village.slug,
    status: village.status,
    region: village.region,
    hasJoinCode: Boolean(village.joinCode),
    residents: residents.get(village.id) ?? 0,
    coordinators: coordinators.get(village.id) ?? 0,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Villages
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Activating a village mints its join code and puts it in the picker on
        the sign-up screens. Until then a parish is a directory entry that
        nobody can join.
      </p>

      {/*
        Linked rather than embedded, and deliberately not gated here. The merge
        screen needs `SUPER_ADMIN_EMAILS` and explains that itself to whoever
        opens it — hiding the link from an administrator who lacks the grant
        would leave the one person who can set it unable to find out that it
        exists. Nothing behind the link runs without the second check.
      */}
      <Link
        href="/admin/villages/merge"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"
      >
        <GitMerge className="size-4" aria-hidden />
        Merge two villages
      </Link>

      <nav className="mt-5 flex gap-1 border-b border-slate-200" aria-label="Villages">
        {TABS.map((item) => {
          const params = new URLSearchParams();
          params.set("tab", item.key);
          if (query) params.set("q", query);

          return (
            <Link
              key={item.key}
              href={`/admin/villages?${params.toString()}`}
              aria-current={item.key === active ? "page" : undefined}
              className={
                item.key === active
                  ? "-mb-px border-b-2 border-brand-600 px-4 py-2.5 text-sm font-semibold text-brand-700"
                  : "-mb-px border-b-2 border-transparent px-4 py-2.5 text-sm font-medium text-slate-500 transition hover:text-slate-800"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/*
        A GET form, so the search lands in the URL and is linkable. The tab is
        carried in a hidden field rather than rebuilt server-side, so searching
        never silently moves you to the other tab.
      */}
      <form method="get" className="mt-4 flex flex-wrap gap-2">
        <input type="hidden" name="tab" value={active} />
        <div className="relative min-w-0 flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by name, slug or county"
            aria-label="Search villages"
            className="h-11 w-full rounded-lg border border-slate-300 pl-9 pr-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
        <button
          type="submit"
          className="inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          Search
        </button>
      </form>

      {!browsable ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-slate-100 text-slate-500">
            <Search className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            Search for a parish
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
            The directory holds every parish seeded from the ONS Index of Place
            Names, none of which is joinable yet. It is too long to browse —
            type a name to find the one you are activating.
          </p>
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-8 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-safe-50 text-safe-600">
            <ShieldCheck className="size-6" aria-hidden />
          </span>
          <h2 className="mt-4 text-lg font-semibold text-slate-900">
            {query ? "Nothing matched" : "No villages in service yet"}
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate-600">
            {query
              ? "Try a shorter search, or check the other tab — a parish that has not been activated is in the directory."
              : "Find a parish in the directory and activate it. That mints its join code and puts it in the picker on the sign-up screens."}
          </p>
        </div>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {rows.map((village) => (
              <li key={village.id}>
                <VillageCard village={village} />
              </li>
            ))}
          </ul>

          {total > rows.length && (
            <p className="mt-4 text-center text-sm text-slate-500">
              Showing {rows.length} of {total}. Narrow the search to see the
              rest.
            </p>
          )}
        </>
      )}
    </div>
  );
}
