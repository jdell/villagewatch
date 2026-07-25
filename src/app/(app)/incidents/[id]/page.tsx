import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  EyeOff,
  MapPin,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { IncidentCard } from "@/components/incident-card";
import { IncidentLocationMap } from "@/components/incident-location-map";
import { NoVillage } from "@/components/no-village";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PUBLIC_INCIDENT_STATUSES } from "@/lib/constants";
import { PUBLIC_INCIDENT_SELECT, toMapIncident } from "@/lib/incidents";
import { signedMediaUrls } from "@/lib/media/storage";
import { formatDateTime } from "@/lib/format";

/**
 * One incident in full.
 *
 * `params` is a Promise in Next.js 16 — awaited, never destructured in the
 * signature.
 *
 * What is deliberately *not* on this page is `rawDescription`. The reporter and
 * their coordinator are entitled to read it, but every read of it owes an
 * `AuditLog` row (domain rule 1), and a page that writes an audit entry every
 * time anyone glances at it is the wrong shape for that. It belongs in the
 * moderation queue, where reading it is a deliberate act. This page selects the
 * public columns only, so there is nothing here to leak.
 */

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params;
  const session = await requireSession(`/incidents/${id}`);
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) return { title: "Incident" };

  const incident = await prisma.incident.findFirst({
    // Scoped, because a title is still information — an unscoped lookup would
    // confirm the existence of another village's report.
    where: {
      id,
      villageId,
      OR: [
        { status: { in: [...PUBLIC_INCIDENT_STATUSES] } },
        { reporterId: session.user.id },
      ],
    },
    select: { title: true, reference: true },
  });

  return {
    title: incident ? `${incident.title} · ${incident.reference}` : "Incident",
  };
}

export default async function IncidentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const session = await requireSession(`/incidents/${id}`);
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  const incident = await prisma.incident.findFirst({
    where: {
      // Village first: the tenant boundary applies before anything else
      // (domain rule 4).
      id,
      villageId,
      OR: [
        // Published and resolved reports are the public surface (domain rule 6).
        { status: { in: [...PUBLIC_INCIDENT_STATUSES] } },
        // A reporter can always see their own report while it waits for review
        // — it is their own words, and being unable to check on it is the most
        // common reason someone files the same thing twice.
        { reporterId: session.user.id },
      ],
    },
    select: {
      ...PUBLIC_INCIDENT_SELECT,
      isAnonymous: true,
      reportedToPolice: true,
      policeReference: true,
      tags: { select: { label: true }, orderBy: { label: "asc" } },
      media: {
        // Only media that has been through redaction is ever served
        // (domain rule 3).
        where: { redactedAt: { not: null } },
        select: {
          id: true,
          redactedPath: true,
          mimeType: true,
          width: true,
          height: true,
        },
        orderBy: { position: "asc" },
      },
    },
  });

  if (!incident) notFound();

  const urls = await signedMediaUrls(
    incident.media.flatMap((item) => item.redactedPath ?? []),
  );

  const pin = toMapIncident(incident);
  const isPublic = (PUBLIC_INCIDENT_STATUSES as readonly string[]).includes(
    incident.status,
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/incidents"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-700"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All incidents
      </Link>

      {!isPublic && (
        <div className="mt-4 flex gap-3 rounded-xl bg-amber-50 p-3.5 ring-1 ring-amber-200">
          <ShieldCheck className="size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm leading-relaxed text-amber-900">
            <p className="font-medium">Only you can see this</p>
            <p className="mt-1 text-amber-800">
              Your report is with your village coordinator. It appears on the map
              once they have reviewed it.
            </p>
          </div>
        </div>
      )}

      <div className="mt-4">
        <IncidentCard
          incident={{
            id: incident.id,
            reference: incident.reference,
            type: incident.type,
            severity: incident.severity,
            status: incident.status,
            title: incident.title,
            description: incident.description,
            occurredAt: incident.occurredAt,
            locationText: incident.locationText,
            tags: incident.tags.map((tag) => tag.label),
          }}
        />
      </div>

      {incident.recurring && incident.patternNote && (
        <div className="mt-4 flex gap-3 rounded-xl bg-amber-50 p-3.5 ring-1 ring-amber-200">
          <TrendingUp className="size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm leading-relaxed text-amber-900">
            <p className="font-medium">Part of a pattern</p>
            <p className="mt-1 text-amber-800">{incident.patternNote}</p>
          </div>
        </div>
      )}

      {incident.media.length > 0 && (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <EyeOff className="size-4 text-slate-400" aria-hidden />
            Blurred media
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Faces were blurred on the reporter&rsquo;s device before upload. The
            originals were never sent to us.
          </p>

          <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {incident.media.map((item) => {
              const url = item.redactedPath
                ? urls.get(item.redactedPath)
                : undefined;
              if (!url) return null;

              return (
                <li
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                >
                  {item.mimeType.startsWith("video/") ? (
                    <video
                      src={url}
                      controls
                      playsInline
                      preload="metadata"
                      className="h-56 w-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={url}
                      alt="Blurred media attached to this report"
                      className="h-56 w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {pin && (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MapPin className="size-4 text-slate-400" aria-hidden />
            Where
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            The pin is shifted slightly from the reported position, so the map
            never shows exactly where the reporter was standing.
          </p>
          <div className="mt-3">
            <IncidentLocationMap incident={pin} />
          </div>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-slate-900">Report details</h2>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Reference</dt>
            <dd className="mt-0.5 font-mono text-slate-900">
              {incident.reference}
            </dd>
          </div>

          <div>
            <dt className="text-slate-500">Filed</dt>
            <dd className="mt-0.5 text-slate-900">
              {formatDateTime(incident.reportedAt)}
            </dd>
          </div>

          {incident.peopleCount !== null && (
            <div>
              <dt className="text-slate-500">People involved</dt>
              <dd className="mt-0.5 inline-flex items-center gap-1.5 text-slate-900">
                <Users className="size-4 text-slate-400" aria-hidden />
                {incident.peopleCount}
              </dd>
            </div>
          )}

          {incident.reportedToPolice && (
            <div>
              <dt className="text-slate-500">Reported to police</dt>
              <dd className="mt-0.5 font-mono text-slate-900">
                {incident.policeReference ?? "Yes"}
              </dd>
            </div>
          )}
        </dl>

        <p className="mt-4 inline-flex items-start gap-2 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
          <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {incident.anonymized
            ? "This description was rewritten to remove personal details before publication, and checked by the reporter."
            : "This description is the reporter's own wording, reviewed by a coordinator."}
        </p>
      </section>
    </div>
  );
}
