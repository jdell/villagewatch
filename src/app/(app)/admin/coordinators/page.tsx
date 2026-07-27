import type { Metadata } from "next";
import Link from "next/link";
import { Inbox, ShieldCheck } from "lucide-react";
import type { CoordinatorRequestStatus } from "@/generated/prisma/enums";
import {
  CoordinatorRequestCard,
  type ReviewableRequest,
} from "@/components/admin/coordinator-request-card";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  COORDINATOR_REQUEST_PAGE_SIZE,
  USER_ROLE_LABELS,
} from "@/lib/constants";

export const metadata: Metadata = { title: "Coordinator requests" };

/**
 * The platform administrator's queue of coordinator applications.
 *
 * **Not village-scoped**, and it is the only page in the app that is not. Every
 * other authenticated screen renders one village's data, because the village is
 * the tenant boundary (domain rule 4). This one is what *creates* a village's
 * first coordinator, so scoping it to the reviewer's own village would make it
 * useless for the 10,670 seeded parishes that have nobody in them at all. See
 * `src/lib/coordinator-requests.ts` for the full reasoning.
 *
 * Two tabs, because the second is the accountability half: an approval hands
 * somebody the ability to read their neighbours' verbatim reports, and a queue
 * that empties itself with no history leaves the audit trail as the only record
 * that anyone can find of who was let in and why.
 */

const TABS = [
  { key: "pending", label: "Awaiting review", status: "PENDING" },
  { key: "decided", label: "Past decisions", status: null },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function isTab(value: string | undefined): value is TabKey {
  return TABS.some((tab) => tab.key === value);
}

export default async function AdminCoordinatorsPage({
  searchParams,
}: {
  // Next 16: `searchParams` is a Promise and has to be awaited.
  searchParams: Promise<{ tab?: string }>;
}) {
  await requireAdmin("/admin/coordinators");

  const { tab } = await searchParams;
  const active: TabKey = isTab(tab) ? tab : "pending";

  if (!process.env.DATABASE_URL) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-sm text-slate-500">
          The database is not configured on this deployment.
        </p>
      </div>
    );
  }

  // The decided tab is both outcomes together, newest decision first: an
  // administrator looking something up is looking for a person, and does not
  // know in advance which pile they landed in.
  const statusFilter: { in: CoordinatorRequestStatus[] } | CoordinatorRequestStatus =
    active === "pending" ? "PENDING" : { in: ["APPROVED", "REJECTED"] };

  const [rows, pendingCount] = await Promise.all([
    prisma.coordinatorRequest.findMany({
      where: { status: statusFilter },
      orderBy:
        active === "pending"
          ? { createdAt: "asc" }
          : [{ reviewedAt: "desc" }, { createdAt: "desc" }],
      take: COORDINATOR_REQUEST_PAGE_SIZE,
      select: {
        id: true,
        role: true,
        roleDetail: true,
        reason: true,
        status: true,
        reviewNote: true,
        reviewedAt: true,
        createdAt: true,
        user: { select: { fullName: true, email: true, role: true } },
        village: { select: { name: true, region: true } },
        reviewedBy: { select: { fullName: true } },
      },
    }),
    prisma.coordinatorRequest.count({ where: { status: "PENDING" } }),
  ]);

  const requests: ReviewableRequest[] = rows.map((row) => ({
    id: row.id,
    role: row.role,
    roleDetail: row.roleDetail,
    reason: row.reason,
    status: row.status,
    reviewNote: row.reviewNote,
    // Serialised for the client component — a Date cannot cross that boundary.
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    applicantName: row.user.fullName,
    applicantEmail: row.user.email,
    applicantRoleLabel: USER_ROLE_LABELS[row.user.role],
    villageName: row.village.name,
    villageRegion: row.village.region,
    reviewedByName: row.reviewedBy?.fullName ?? null,
  }));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-slate-900">
        <ShieldCheck className="size-6 text-brand-600" aria-hidden />
        Coordinator requests
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Residents asking to run their village&rsquo;s reports. Approving one
        promotes them to coordinator and gives them the moderation queue.
      </p>

      <nav aria-label="Application status" className="mt-6 flex gap-1">
        {TABS.map((item) => {
          const isActive = item.key === active;

          return (
            <Link
              key={item.key}
              href={item.key === "pending" ? "/admin/coordinators" : "?tab=decided"}
              aria-current={isActive ? "page" : undefined}
              className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium transition ${
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {item.label}
              {item.key === "pending" && pendingCount > 0 && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                    isActive ? "bg-white/20" : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {requests.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-500">
            <Inbox className="size-5" aria-hidden />
          </span>
          <p className="mt-3 text-sm font-medium text-slate-900">
            {active === "pending"
              ? "Nothing waiting on you"
              : "Nothing has been decided yet"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {active === "pending"
              ? "Applications appear here the moment a resident sends one, and you get a notification."
              : "Approvals and rejections are kept here permanently."}
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {requests.map((request) => (
            <CoordinatorRequestCard key={request.id} request={request} />
          ))}
        </div>
      )}

      {requests.length === COORDINATOR_REQUEST_PAGE_SIZE && (
        <p className="mt-4 text-xs text-slate-500">
          Showing the first {COORDINATOR_REQUEST_PAGE_SIZE}. There is no paging
          here yet — decide some of these and the rest will appear.
        </p>
      )}
    </div>
  );
}
