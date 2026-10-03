import Link from "next/link";
import {
  ArrowRight,
  ChevronRight,
  EyeOff,
  Plus,
  Repeat,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { IncidentStatus, IncidentType, Severity } from "@/generated/prisma/enums";
import type { MapIncident } from "@/components/incident-map";
import { IncidentActions } from "@/components/incident-actions";
import { IncidentTypeIcon } from "@/components/incident-type-icon";
import { PoliceReferenceField } from "@/components/police-reference-field";
import { CoordinatorTools } from "@/components/report/coordinator-tools";
import { ReportMapHeader } from "@/components/report/report-map-header";
import { ReportNav } from "@/components/report/report-nav";
import { ReportStatusBanner } from "@/components/report/report-status-banner";
import { ReporterActions } from "@/components/report/reporter-actions";
import { VoteButtons } from "@/components/vote-buttons";
import {
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
  SEVERITY_LABELS,
} from "@/lib/constants";
import { formatDateTime, formatTimeAgo } from "@/lib/format";
import { LIVE_WINDOW_HOURS, type ReportBannerKind } from "@/lib/incident-live";
import { PIN_HEAT, PIN_SOFT } from "@/lib/map/glyph-pin";
import type { VoteState } from "@/lib/votes";

/**
 * A report's page, drawn — everything below the data. `src/app/(app)/incidents/
 * [id]/page.tsx` reads the row and decides what this viewer may do; this
 * renders it, and takes nothing it could use to decide anything. Split so the
 * page can be checked with fixture data and no database.
 *
 * Top to bottom, the design's order: the bar (back, reference, share), the
 * 200px map, the status banner, the report (badges, title, when · where · who,
 * the words, tags, the AI note), the vote card, the pattern card, the media,
 * the details, the reporter's rows, the coordinator's Moderate button, and
 * "Seen something related?". Cards are white, 18px radius, 16px padding.
 *
 * Every field is a public column or the viewer's own (domain rule 1): there is
 * no `rawDescription` in `ReportPageIncident` to render.
 */

export type ReportPageIncident = {
  id: string;
  reference: string;
  type: IncidentType;
  severity: Severity;
  status: IncidentStatus;
  title: string;
  description: string;
  occurredAt: Date;
  reportedAt: Date;
  locationText: string | null;
  peopleCount: number | null;
  severityRationale: string | null;
  anonymized: boolean;
  recurring: boolean;
  patternNote: string | null;
  reportedToPolice: boolean;
  policeReference: string | null;
  tags: { label: string }[];
  media: {
    id: string;
    redactedPath: string | null;
    mimeType: string;
    createdAt: Date;
  }[];
};

export type ReportPageProps = {
  incident: ReportPageIncident;
  pin: MapIncident | null;
  /** Signed URLs by redacted path. A file with none is not drawn. */
  urls: Map<string, string>;
  banner: ReportBannerKind;
  bannerCopy: {
    when: string | null;
    text: string;
    action: { href: string; label: string } | null;
  };
  happening: boolean;
  endedAt: Date | null;
  votes: VoteState | null;
  related: MapIncident[];
  shareUrl: string | null;
  isReporter: boolean;
  isCoordinator: boolean;
  isPublic: boolean;
  inQueue: boolean;
  deletable: boolean;
  markOverAllowed: boolean;
  canSetPoliceReference: boolean;
  openApprove: boolean;
  alreadyReviewed: boolean;
  /** The PCSO summary and the WhatsApp alert, for the coordinator's sheet. */
  coordinatorExtras?: React.ReactNode;
};

const CARD =
  "rounded-[18px] bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,.06),0_2px_8px_rgba(15,23,42,.05)]";
const CARD_TITLE = "text-[15px] font-[650] text-[#0f172a]";

export function ReportPage({
  incident,
  pin,
  urls,
  banner,
  bannerCopy,
  happening,
  endedAt,
  votes,
  related,
  shareUrl,
  isReporter,
  isCoordinator,
  isPublic,
  inQueue,
  deletable,
  markOverAllowed,
  canSetPoliceReference,
  openApprove,
  alreadyReviewed,
  coordinatorExtras = null,
}: ReportPageProps) {
  const severity = incident.severity;
  const occurred = incident.occurredAt;

  /*
    What the coordinator's sheet promises on its button — the next decision,
    not a list of everything inside.
  */
  const moderateSummary = inQueue
    ? "Approve or reject — not on the map yet"
    : incident.status === "PUBLISHED"
      ? "Resolve, archive, or share with the police"
      : incident.status === "RESOLVED"
        ? "Archive, or share with the police"
        : `This report is ${INCIDENT_STATUS_LABELS[incident.status].toLowerCase()}`;

  const reporterRowsVisible =
    (isReporter && inQueue) || markOverAllowed || (isReporter && deletable);


  return (
    <div className="min-h-full bg-[#f1f5f9] pb-8 lg:bg-transparent lg:py-8">
      <div className="mx-auto w-full max-w-2xl lg:px-6">
        <ReportNav
          reference={incident.reference}
          shareUrl={shareUrl}
          shareTitle={`${incident.reference} — ${incident.title}`}
        />

        {pin && <ReportMapHeader incident={pin} />}

        <div className="flex flex-col gap-4 px-4 pt-4 lg:px-0">
          {openApprove && (
            <div className="flex gap-3 rounded-[18px] bg-[#f0f9ff] p-4 ring-1 ring-[#bae6fd]">
              <ShieldCheck className="size-5 shrink-0 text-[#0284c7]" aria-hidden />
              <p className="text-[13.5px] leading-relaxed text-[#0c4a6e]">
                <span className="font-semibold">Read it, then approve.</span>{" "}
                Approving publishes this report to the village map and alerts
                your neighbours. The confirmation is in the Moderate sheet.
              </p>
            </div>
          )}

          {alreadyReviewed && (
            <div className="flex gap-3 rounded-[18px] bg-white p-4 ring-1 ring-[#e2e8f0]">
              <ShieldCheck className="size-5 shrink-0 text-[#64748b]" aria-hidden />
              <p className="text-[13.5px] leading-relaxed text-[#334155]">
                <span className="font-semibold text-[#0f172a]">
                  Already reviewed.
                </span>{" "}
                {`This report is now ${INCIDENT_STATUS_LABELS[incident.status].toLowerCase()}, so there is nothing left to approve.`}
              </p>
            </div>
          )}

          <ReportStatusBanner
            kind={banner}
            when={bannerCopy.when}
            text={bannerCopy.text}
            action={bannerCopy.action}
          />

          {/* The report itself: badges, title, who and when, the words. */}
          <article className={`${CARD} flex flex-col gap-3`}>
            <div className="flex flex-wrap gap-1.5">
              <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#f1f5f9] px-2.5 text-[12.5px] font-[550] text-[#334155]">
                <IncidentTypeIcon type={incident.type} className="size-3.5" />
                {INCIDENT_TYPE_LABELS[incident.type]}
              </span>
              <span
                className="inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] font-semibold"
                style={{
                  backgroundColor: PIN_SOFT[severity].bg,
                  color: PIN_SOFT[severity].text,
                }}
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: PIN_HEAT[severity] }}
                  aria-hidden
                />
                {SEVERITY_LABELS[severity]}
              </span>
              {happening && (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[#dc2626] px-2.5 text-[12.5px] font-semibold text-white">
                  <span className="size-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden />
                  Live
                </span>
              )}
            </div>

            <h1 className="text-[22px] leading-tight font-[700] text-pretty text-[#0f172a]">
              {incident.title}
            </h1>

            <p className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-[13.5px] text-[#64748b]">
              <time dateTime={occurred.toISOString()} title={formatDateTime(occurred)}>
                {formatTimeAgo(occurred)}
              </time>
              {incident.locationText && (
                <>
                  <span aria-hidden>·</span>
                  <span>{incident.locationText}</span>
                </>
              )}
              <span aria-hidden>·</span>
              {/*
                Never a name. No resident-facing screen has ever shown who
                filed a report — see "Filing anonymously" — and a coordinator
                sees the reporter in the queue, not here.
              */}
              <span>{isReporter ? "Filed by you" : "Filed by a resident"}</span>
            </p>

            <p className="text-[15.5px] leading-relaxed whitespace-pre-line text-pretty text-[#1e293b]">
              {incident.description}
            </p>

            {incident.tags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Tags">
                {incident.tags.map((tag) => (
                  <li
                    key={tag.label}
                    className="rounded-full border border-[#e2e8f0] px-2.5 py-0.5 text-[12.5px] text-[#475569]"
                  >
                    {tag.label}
                  </li>
                ))}
              </ul>
            )}

            <p className="flex items-start gap-2 border-t border-[#f1f5f9] pt-3 text-[12.5px] leading-relaxed text-[#64748b]">
              <Sparkles className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {incident.anonymized
                ? "Rewritten to remove personal details before it was published, and checked by the reporter."
                : "The reporter's own wording, read by a coordinator before it was published."}
            </p>
          </article>

          {votes && (
            <section aria-labelledby="vote-title" className={`${CARD} flex flex-col gap-3`}>
              <h2 id="vote-title" className={CARD_TITLE}>
                How serious does the village think this is?
              </h2>
              <VoteButtons incidentId={incident.id} initial={votes} wide />
              <p className="text-[12.5px] leading-relaxed text-[#64748b]">
                Your neighbours see the totals, never who voted. It changes
                nothing about the report — it helps your coordinator see what
                the village is worried about.
              </p>
            </section>
          )}

          {incident.recurring && (
            <section aria-labelledby="pattern-title" className={`${CARD} flex flex-col gap-3`}>
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[#0f172a]">
                  <Repeat className="size-4 text-white" strokeWidth={2.25} aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <h2 id="pattern-title" className={CARD_TITLE}>
                    Part of a pattern
                  </h2>
                  <p className="text-[13.5px] text-[#475569]">
                    {incident.patternNote ??
                      "Similar reports close by in the last few weeks."}
                  </p>
                </div>
              </div>

              {related.length > 0 && (
                <ul className="divide-y divide-[#f1f5f9] border-t border-[#f1f5f9]">
                  {related.map((other) => (
                    <li key={other.id}>
                      <Link
                        href={`/incidents/${other.id}`}
                        className="flex min-h-14 items-center gap-3 py-2"
                      >
                        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-[#f1f5f9]">
                          <IncidentTypeIcon type={other.type} className="size-4 text-[#334155]" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[14px] font-[550] text-[#0f172a]">
                            {other.title}
                          </span>
                          <span className="truncate text-[12.5px] text-[#64748b]">
                            {formatTimeAgo(other.occurredAt)}
                            {other.locationText ? ` · ${other.locationText}` : ""}
                          </span>
                        </span>
                        <ChevronRight className="size-[18px] text-[#94a3b8]" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}

              {pin && isPublic && (
                <Link
                  href={`/map?incident=${incident.id}&pattern=1`}
                  className="flex h-11 items-center justify-center gap-2 rounded-[14px] bg-[#0f172a] text-[14px] font-semibold text-white transition hover:bg-[#1e293b]"
                >
                  Show all on map
                  <ArrowRight className="size-4" aria-hidden />
                </Link>
              )}
            </section>
          )}

          {incident.media.length > 0 && (
            <section aria-labelledby="media-title" className={`${CARD} flex flex-col gap-3`}>
              <h2 id="media-title" className={CARD_TITLE}>
                Photos and video
              </h2>
              <ul className="grid grid-cols-2 gap-2">
                {incident.media.map((item) => {
                  const url = item.redactedPath
                    ? urls.get(item.redactedPath)
                    : undefined;
                  if (!url) return null;

                  return (
                    <li
                      key={item.id}
                      className="relative aspect-square overflow-hidden rounded-[14px] bg-[#e2e8f0]"
                    >
                      {item.mimeType.startsWith("video/") ? (
                        <video
                          src={url}
                          controls
                          playsInline
                          preload="metadata"
                          className="size-full object-cover"
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt="Media attached to this report, with faces covered"
                          className="size-full object-cover"
                          loading="lazy"
                        />
                      )}
                      <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white">
                        {formatDateTime(item.createdAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-[#64748b]">
                <EyeOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                Faces were covered on the reporter&rsquo;s phone before upload.
                The originals never left it.
              </p>
            </section>
          )}

          <section aria-labelledby="details-title" className={CARD}>
            <h2 id="details-title" className={CARD_TITLE}>
              Details
            </h2>
            <dl className="mt-2 divide-y divide-[#f1f5f9] text-[14px]">
              <DetailRow label="Reference">
                <span className="font-mono">{incident.reference}</span>
              </DetailRow>
              <DetailRow label="Filed">{formatDateTime(incident.reportedAt)}</DetailRow>
              <DetailRow label="Category">
                {INCIDENT_TYPE_LABELS[incident.type]}
              </DetailRow>
              <DetailRow label="Status">
                {happening ? "Happening now" : INCIDENT_STATUS_LABELS[incident.status]}
                {endedAt && (
                  <span className="text-[#64748b]">
                    {" "}
                    · over {formatTimeAgo(endedAt)}
                  </span>
                )}
              </DetailRow>
              {incident.locationText && (
                <DetailRow label="Location">{incident.locationText}</DetailRow>
              )}
              {incident.peopleCount !== null && (
                <DetailRow label="People involved">{incident.peopleCount}</DetailRow>
              )}
              {incident.severityRationale && (
                <DetailRow label="Why this severity" stacked>
                  {incident.severityRationale}
                </DetailRow>
              )}
              {canSetPoliceReference ? (
                <div className="py-3">
                  <PoliceReferenceField
                    incidentId={incident.id}
                    policeReference={incident.policeReference}
                    reportedToPolice={incident.reportedToPolice}
                  />
                </div>
              ) : (
                incident.reportedToPolice && (
                  <DetailRow label="Reported to police">
                    <span className="font-mono">
                      {incident.policeReference ?? "Yes"}
                    </span>
                  </DetailRow>
                )
              )}
            </dl>
          </section>

          {reporterRowsVisible && (
            <div id="reporter-actions" className="scroll-mt-20">
              <ReporterActions
                incidentId={incident.id}
                heading={isReporter ? "Your report" : "This report"}
                canEdit={isReporter && inQueue}
                canMarkOver={markOverAllowed}
                // Wider than `canEdit` on purpose: erasing is the reporter's
                // right and not conditional on the queue (UK GDPR Article 17).
                // `removeIncident` re-checks both ownership and status.
                canDelete={isReporter && deletable}
              />
            </div>
          )}

          {isCoordinator && (
            <div id="moderate" className="scroll-mt-20">
              <CoordinatorTools summary={moderateSummary} openInitially={openApprove}>
                <IncidentActions
                  incidentId={incident.id}
                  status={incident.status}
                  canEdit={false}
                  canDelete={false}
                  canModerate
                  openApprove={openApprove}
                  bare
                />
                {coordinatorExtras}
              </CoordinatorTools>
            </div>
          )}

          {/*
            Two links rather than one, because the two screen sizes report
            differently: below `lg` the report sheet over the map, from `lg`
            the five-step wizard the sidebar opens.
          */}
          <section className={`${CARD} flex items-center gap-3`}>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h2 className={CARD_TITLE}>Seen something related?</h2>
              <p className="text-[13px] text-[#64748b]">
                Report it — your coordinator can see the two together.
              </p>
            </div>
            <Link
              href="/map?report=1"
              className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[14px] bg-[#0284c7] px-4 text-[14px] font-semibold text-white transition hover:bg-[#0369a1] lg:hidden"
            >
              <Plus className="size-4" aria-hidden />
              Report
            </Link>
            <Link
              href="/incidents/new"
              className="hidden h-11 shrink-0 items-center gap-1.5 rounded-[14px] bg-[#0284c7] px-4 text-[14px] font-semibold text-white transition hover:bg-[#0369a1] lg:inline-flex"
            >
              <Plus className="size-4" aria-hidden />
              Report
            </Link>
          </section>

          {happening && (
            <p className="px-1 text-center text-[12px] text-[#94a3b8]">
              Shown as happening now for {LIVE_WINDOW_HOURS} hours after it
              happened, or until somebody says it is over.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  stacked = false,
  children,
}: {
  label: string;
  stacked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        stacked
          ? "flex flex-col gap-1 py-3"
          : "flex min-h-12 items-center justify-between gap-4 py-2.5"
      }
    >
      <dt className="shrink-0 text-[#64748b]">{label}</dt>
      <dd
        className={
          stacked ? "text-[#0f172a]" : "min-w-0 text-right text-[#0f172a]"
        }
      >
        {children}
      </dd>
    </div>
  );
}
