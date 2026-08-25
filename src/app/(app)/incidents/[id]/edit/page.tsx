import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { IncidentEditForm } from "@/components/incident-edit-form";
import { NoVillage } from "@/components/no-village";
import { requireSession } from "@/lib/auth";
import { isCoordinatorRole } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Edit report" };

/**
 * Correcting a report that has not been reviewed yet.
 *
 * `params` is a Promise in Next.js 16 — awaited, never destructured in the
 * signature.
 *
 * The query is the access check: it matches on the village, on the status still
 * being one that may be changed, and — for everybody but a coordinator — on the
 * reporter being the current user. Anything else is a 404 rather than a 403,
 * because "this report exists but is not yours" is itself information about
 * another resident's report. `editIncidentAction` re-applies the same predicate
 * on the write.
 *
 * ## Two callers, and the second is new
 *
 * **The reporter**, correcting their own report before anybody has reviewed it.
 *
 * **A coordinator**, correcting a report in their own village that is still in
 * the queue — the Edit button on `/dashboard/queue`. Until the dashboard
 * redesign a queued report with an identifying landmark in it could only be
 * published as filed or rejected outright, which is a poor pair of options for
 * a fixable mistake.
 *
 * Both constraints that matter are unchanged: **queue statuses only**, so a
 * published report cannot be rewritten by anybody, and **the coordinator's own
 * village** (domain rule 4). `rawDescription` is not among the five fields the
 * form edits, so the reporter's verbatim words survive an edit untouched — and
 * `AuditLog.actorRole` is already on the `incident.edit` row, so a
 * coordinator's edit and a reporter's are distinguishable in the trail without
 * a new action.
 */

type PageProps = { params: Promise<{ id: string }> };

export default async function EditIncidentPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession(`/incidents/${id}/edit`);
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  // A coordinator may correct anything still in their village's queue; everyone
  // else, only their own report. Kept in the predicate rather than checked
  // after the read, so "not yours" and "does not exist" stay indistinguishable.
  const coordinator = isCoordinatorRole(session.profile?.role);

  const incident = await prisma.incident.findFirst({
    where: {
      id,
      villageId,
      ...(coordinator ? {} : { reporterId: session.user.id }),
      status: { in: ["DRAFT", "PENDING_REVIEW"] },
    },
    select: {
      id: true,
      reference: true,
      title: true,
      // The public column — this is what the form edits.
      description: true,
      type: true,
      severity: true,
      locationText: true,
      reporterId: true,
    },
  });

  if (!incident) notFound();

  const own = incident.reporterId === session.user.id;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href={`/incidents/${incident.id}`}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-700"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Back to the report
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
        {own ? "Edit your report" : "Edit this report"}
      </h1>
      {/*
        Two sentences, because the two callers are in genuinely different
        positions. A reporter is told their change is not waiting on anybody; a
        coordinator is told they are editing a neighbour's words, which is the
        thing worth pausing over.
      */}
      <p className="mt-1 text-sm text-slate-500">
        <span className="font-mono">{incident.reference}</span> ·{" "}
        {own
          ? "still waiting for your coordinator, so changes go through straight away."
          : "a resident’s report, still in your review queue. Your edit is recorded in the audit trail."}
      </p>

      <IncidentEditForm
        values={{
          id: incident.id,
          title: incident.title,
          description: incident.description,
          type: incident.type,
          severity: incident.severity,
          locationText: incident.locationText ?? "",
        }}
      />
    </div>
  );
}
