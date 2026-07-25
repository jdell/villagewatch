import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { IncidentEditForm } from "@/components/incident-edit-form";
import { NoVillage } from "@/components/no-village";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Edit report" };

/**
 * Correcting a report that has not been reviewed yet.
 *
 * `params` is a Promise in Next.js 16 — awaited, never destructured in the
 * signature.
 *
 * The query is the access check: it matches on the village, on the reporter
 * being the current user, and on the status still being one a reporter may
 * change. Anything else is a 404 rather than a 403, because "this report exists
 * but is not yours" is itself information about another resident's report.
 * `editIncidentAction` re-applies the same predicate on the write.
 */

type PageProps = { params: Promise<{ id: string }> };

export default async function EditIncidentPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession(`/incidents/${id}/edit`);
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  const incident = await prisma.incident.findFirst({
    where: {
      id,
      villageId,
      reporterId: session.user.id,
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
    },
  });

  if (!incident) notFound();

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
        Edit your report
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        <span className="font-mono">{incident.reference}</span> · still waiting
        for your coordinator, so changes go through straight away.
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
