import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Lock, TriangleAlert } from "lucide-react";
import { VillageMergeForm } from "@/components/admin/village-merge-form";
import { requireAdmin, isSuperAdmin } from "@/lib/auth";
import { isSuperAdminConfigured } from "@/lib/admin";
import { listMergeableVillages } from "@/lib/village-merge";

export const metadata: Metadata = {
  title: "Merge villages",
  robots: { index: false, follow: false },
};

/**
 * Merging one village into another — the screen behind
 * `scripts/merge-histon-impington.sql`.
 *
 * **`requireAdmin()` and then a second check, rather than one guard that
 * redirects.** A platform administrator who arrives here without the
 * super-administrator grant is shown what is missing and where it is set. The
 * alternative — bouncing them silently — reads as a broken link to somebody who
 * was told the page exists, and they are the one person who can fix the
 * configuration. Nobody who is not already an administrator gets that far:
 * `requireAdmin()` sends them to `/map` first.
 *
 * The gate that matters is on the route handler, not here. This page renders a
 * form; `POST /api/admin/villages/merge` is what performs the merge and it
 * checks the session itself, because `src/proxy.ts` passes `/api/` straight
 * through.
 *
 * `noindex` like every authenticated surface, and `/admin` is already
 * disallowed in `robots.txt`.
 */
export default async function AdminVillageMergePage() {
  const session = await requireAdmin("/admin/villages/merge");

  const allowed = isSuperAdmin(session);
  const villages = allowed ? await listMergeableVillages() : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
      <Link
        href="/admin/villages"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Villages
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
        Merge villages
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        Moves every resident, report, pattern alert and coordinator application
        out of one village and into another, then archives the one it emptied.
        There is no undo button.
      </p>

      {!allowed ? (
        <div className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <span className="grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-500">
            <Lock className="size-5" aria-hidden />
          </span>
          <h2 className="mt-4 text-base font-semibold text-slate-900">
            This needs super-administrator access
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Merging a village rewrites who every resident and every report
            belongs to, and the audit trail it leaves behind cannot be moved
            back. That is held separately from ordinary administrator access, so
            that the list of people who can review coordinator applications and
            the list of people who can destroy a village do not have to be the
            same list.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {isSuperAdminConfigured ? (
              <>
                Your address is not in <code>SUPER_ADMIN_EMAILS</code> on this
                deployment.
              </>
            ) : (
              <>
                <code>SUPER_ADMIN_EMAILS</code> is not set on this deployment, so
                nobody holds it. It is comma-separated, server-only, and set
                alongside <code>ADMIN_EMAILS</code> in Vercel — there is
                deliberately no default.
              </>
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 flex gap-3 rounded-xl bg-red-50 p-4 ring-1 ring-inset ring-red-600/20">
            <TriangleAlert
              className="mt-0.5 size-5 shrink-0 text-red-600"
              aria-hidden
            />
            <div className="text-sm leading-relaxed text-red-900">
              <p className="font-semibold">Read the preview before confirming</p>
              <p className="mt-1">
                Report reference numbers change, the archived village&rsquo;s
                audit trail becomes unreachable, and its join code stops working
                and is not recorded anywhere. Tell both villages&rsquo;
                coordinators first — this changes what residents can see and do.
              </p>
            </div>
          </div>

          <div className="mt-6">
            <VillageMergeForm villages={villages} />
          </div>
        </>
      )}
    </div>
  );
}
