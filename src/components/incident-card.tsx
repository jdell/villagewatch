import Link from "next/link";
import { Clock, EyeOff, MapPin, Play, ShieldCheck } from "lucide-react";
import type {
  IncidentStatus,
  IncidentType,
  Severity,
} from "@/generated/prisma/enums";
import { IncidentTypeIcon } from "@/components/incident-type-icon";
import { SeverityBadge } from "@/components/severity-badge";
import {
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
  PUBLIC_INCIDENT_STATUSES,
} from "@/lib/constants";
import { formatDateTime, formatTimeAgo } from "@/lib/format";

/**
 * One incident, rendered the same way everywhere it appears: the wizard's
 * preview screen, the incident list, and the detail page.
 *
 * It takes a flat view model rather than a Prisma row on purpose. The preview
 * screen renders an incident that does not exist yet, off a blob URL held in
 * browser memory; the list renders a saved row with a signed storage URL. One
 * shape covers both, and — more to the point — nothing here can accidentally
 * read `rawDescription`, because the view model has no such field.
 *
 * `description` is always the public, anonymised text. Never pass the
 * reporter's verbatim words to this component outside the preview screen, where
 * the only person looking is the reporter who wrote them.
 */

export type IncidentCardMedia = {
  /** Blurred thumbnail: an object URL in the wizard, a signed URL once saved. */
  thumbnailUrl: string;
  kind: "image" | "video";
  /** Faces covered by the on-device blur. Shown as reassurance, not as a stat. */
  facesBlurred?: number;
  /** Extra attachments beyond the one being shown. */
  additionalCount?: number;
};

export type IncidentCardData = {
  id?: string;
  reference?: string | null;
  type: IncidentType;
  severity: Severity;
  status?: IncidentStatus;
  title: string;
  /** The anonymised, public description — never `rawDescription`. */
  description: string;
  occurredAt: Date | string;
  locationText?: string | null;
  media?: IncidentCardMedia | null;
  tags?: readonly string[];
};

type IncidentCardProps = {
  incident: IncidentCardData;
  /** Wraps the card in a link to the detail page. Omit inside the wizard. */
  href?: string;
  /** Denser layout for list rows. */
  compact?: boolean;
  /** Action buttons rendered under the body — how AiPreview adds its controls. */
  footer?: React.ReactNode;
  className?: string;
};

function Thumbnail({
  media,
  compact,
}: {
  media: IncidentCardMedia;
  compact: boolean;
}) {
  const size = compact ? "size-20 sm:size-24" : "h-44 w-full sm:h-52";

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200 ${size}`}
    >
      {/* Always the blurred variant — the original never reached the server. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={media.thumbnailUrl}
        alt={
          media.kind === "video"
            ? "Blurred still from the attached video"
            : "Blurred photo attached to this report"
        }
        className="size-full object-cover"
        loading="lazy"
      />

      {media.kind === "video" && (
        <span className="absolute inset-0 grid place-items-center bg-slate-900/25">
          <Play className="size-7 fill-white text-white drop-shadow" aria-hidden />
        </span>
      )}

      {media.additionalCount ? (
        <span className="absolute bottom-1.5 right-1.5 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-xs font-medium text-white">
          +{media.additionalCount}
        </span>
      ) : null}

      {media.facesBlurred ? (
        <span
          className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-xs font-medium text-white"
          title={`${media.facesBlurred} ${
            media.facesBlurred === 1 ? "face was" : "faces were"
          } blurred on your device before upload`}
        >
          <EyeOff className="size-3" aria-hidden />
          {media.facesBlurred}
        </span>
      ) : null}
    </div>
  );
}

export function IncidentCard({
  incident,
  href,
  compact = false,
  footer,
  className = "",
}: IncidentCardProps) {
  const {
    type,
    severity,
    status,
    title,
    description,
    occurredAt,
    locationText,
    media,
    tags,
    reference,
  } = incident;

  const isPublic =
    status === undefined ||
    (PUBLIC_INCIDENT_STATUSES as readonly IncidentStatus[]).includes(status);

  const heading = href ? (
    <Link href={href} className="outline-none hover:underline focus-visible:underline">
      {title}
      {/* Stretches the link over the whole card so the entire row is clickable. */}
      <span className="absolute inset-0" aria-hidden />
    </Link>
  ) : (
    title
  );

  return (
    <article
      className={`relative rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition sm:p-5 ${
        href ? "hover:border-slate-300 hover:shadow-md" : ""
      } ${className}`}
    >
      <div className={compact ? "flex gap-4" : "flex flex-col gap-4"}>
        {media && !compact && <Thumbnail media={media} compact={false} />}
        {media && compact && <Thumbnail media={media} compact />}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
              <IncidentTypeIcon type={type} className="size-3.5" />
              {INCIDENT_TYPE_LABELS[type]}
            </span>

            <SeverityBadge severity={severity} size="sm" />

            {status && !isPublic && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-300">
                <ShieldCheck className="size-3.5" aria-hidden />
                {INCIDENT_STATUS_LABELS[status]}
              </span>
            )}
          </div>

          <h3
            className={`mt-2.5 font-semibold text-slate-900 ${
              compact ? "text-base" : "text-lg sm:text-xl"
            }`}
          >
            {heading}
          </h3>

          <p
            className={`mt-1.5 text-sm leading-relaxed text-slate-600 ${
              compact ? "line-clamp-2" : ""
            }`}
          >
            {description}
          </p>

          <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
            <div className="inline-flex items-center gap-1.5">
              <dt className="sr-only">When</dt>
              <Clock className="size-3.5" aria-hidden />
              <dd>
                {/*
                  The relative label is computed when this renders, so a
                  server-rendered card and its hydrated counterpart can disagree
                  by a minute. The machine-readable timestamp is the truth.
                */}
                <time
                  dateTime={new Date(occurredAt).toISOString()}
                  title={formatDateTime(occurredAt)}
                  suppressHydrationWarning
                >
                  {formatTimeAgo(occurredAt)}
                </time>
              </dd>
            </div>

            {locationText && (
              <div className="inline-flex min-w-0 items-center gap-1.5">
                <dt className="sr-only">Where</dt>
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                <dd className="truncate">{locationText}</dd>
              </div>
            )}

            {reference && (
              <div className="inline-flex items-center gap-1.5">
                <dt className="sr-only">Reference</dt>
                <dd className="font-mono">{reference}</dd>
              </div>
            )}
          </dl>

          {tags && tags.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {tags.map((tag) => (
                <li
                  key={tag}
                  className="rounded-md bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
                >
                  {tag}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {footer && (
        // `relative` lifts the actions above the stretched heading link, so the
        // buttons stay clickable when the card is also a link.
        <div className="relative mt-4 border-t border-slate-100 pt-4">{footer}</div>
      )}
    </article>
  );
}
