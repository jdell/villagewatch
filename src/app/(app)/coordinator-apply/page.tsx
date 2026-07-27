import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CoordinatorApplyForm } from "@/components/coordinator-apply-form";
import { NoVillage } from "@/components/no-village";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLatestCoordinatorRequest } from "@/lib/coordinator-requests";
import { canApplyForCoordinator } from "@/lib/constants";

export const metadata: Metadata = { title: "Apply to be a coordinator" };

/**
 * The coordinator application form.
 *
 * Three ways out before the form renders, and each of them is the honest answer
 * to a state where the form would be a lie:
 *
 * - **No village.** There is nothing to coordinate. `NoVillage` says so.
 * - **Already a coordinator.** Sent to the dashboard, which is the thing they
 *   would be applying for.
 * - **An application already waiting.** Sent back to `/settings`, where its
 *   status is rendered. Filing a second one is refused server-side anyway
 *   (`submitCoordinatorRequest`); this is so nobody fills in a form that is
 *   going to be turned down after they press the button.
 *
 * A rejected application does **not** bounce. Reapplying is the documented way
 * back, so the form has to be reachable by exactly the people who have been
 * told no.
 */
export default async function CoordinatorApplyPage() {
  const session = await requireSession("/coordinator-apply");
  const profile = session.profile;

  if (!profile?.villageId || !process.env.DATABASE_URL) {
    return (
      <NoVillage
        title="You are not in a village yet"
        description="Coordinators run one village's reports, so there is nothing to apply for until you have joined one."
      />
    );
  }

  if (!canApplyForCoordinator(profile.role)) {
    redirect("/dashboard");
  }

  const [village, latest] = await Promise.all([
    prisma.village.findUnique({
      where: { id: profile.villageId },
      select: { name: true },
    }),
    getLatestCoordinatorRequest(session.user.id),
  ]);

  if (latest?.status === "PENDING") {
    redirect("/settings");
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Apply to be a coordinator
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Coordinators review every report their village files, before anyone else
        sees it.
      </p>

      <dl className="mt-4 rounded-xl bg-slate-100 px-4 py-3 text-sm">
        <div className="flex items-center gap-2">
          <dt className="text-slate-500">Village</dt>
          <dd className="font-medium text-slate-900">
            {village?.name ?? "Your village"}
          </dd>
        </div>
      </dl>

      {latest?.status === "REJECTED" && (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <p className="font-medium text-slate-900">
            You applied before and were declined.
          </p>
          {latest.reviewNote && (
            <p className="mt-1.5 leading-relaxed text-slate-600">
              The reviewer said: {latest.reviewNote}
            </p>
          )}
          <p className="mt-1.5 text-slate-500">
            Answering that here is the thing most likely to change the outcome.
          </p>
        </div>
      )}

      <CoordinatorApplyForm
        villageName={village?.name ?? "your village"}
        applicantName={profile.fullName}
      />
    </div>
  );
}
