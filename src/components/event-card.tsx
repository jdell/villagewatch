import Link from "next/link";
import { CalendarDays, MapPin, UserRound } from "lucide-react";
import type { EventView } from "@/lib/events";
import { formatEventWhen } from "@/lib/format";

/**
 * One community event, the same way on the list and on its own page.
 *
 * The events counterpart of `IncidentCard`, and deliberately not that card with
 * a flag: an event has no severity, no reference, no status and no media, and
 * it *does* name who posted it — the one thing a report card must never do.
 * Two components keep that difference structural rather than a prop somebody
 * could pass the wrong way.
 *
 * The brand blue throughout, which is also an event's pin on the map — no
 * severity uses it.
 */

type EventCardProps = {
  event: Pick<
    EventView,
    | "id"
    | "title"
    | "description"
    | "category"
    | "locationText"
    | "startsAt"
    | "endsAt"
    | "postedBy"
  >;
  /** Wraps the title in a link to the event's page. Omit on the page itself. */
  href?: string;
  /** Denser layout for list rows — the description clamps to two lines. */
  compact?: boolean;
  /** Greys the card for an event that has finished. */
  past?: boolean;
  footer?: React.ReactNode;
};

export function EventCard({
  event,
  href,
  compact = false,
  past = false,
  footer,
}: EventCardProps) {
  const title = href ? (
    <Link
      href={href}
      className="outline-none hover:underline focus-visible:underline"
    >
      {event.title}
    </Link>
  ) : (
    event.title
  );

  return (
    <article
      className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${
        past ? "opacity-75" : ""
      } ${href ? "transition hover:border-slate-300 hover:shadow-md" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 ring-1 ring-inset ring-brand-200">
          <CalendarDays className="size-3.5" aria-hidden />
          {event.category}
        </span>
        {past && (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
            Finished
          </span>
        )}
      </div>

      <h3
        className={`mt-2.5 font-semibold text-slate-900 ${
          compact ? "text-base" : "text-lg sm:text-xl"
        }`}
      >
        {title}
      </h3>

      <p className="mt-1 text-sm font-medium text-brand-800">
        <time dateTime={event.startsAt}>
          {formatEventWhen(event.startsAt, event.endsAt)}
        </time>
      </p>

      {event.description && (
        <p
          className={`mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600 ${
            compact ? "line-clamp-2" : ""
          }`}
        >
          {event.description}
        </p>
      )}

      <dl className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500">
        {event.locationText && (
          <div className="inline-flex items-center gap-1.5">
            <dt className="sr-only">Where</dt>
            <MapPin className="size-3.5" aria-hidden />
            <dd>{event.locationText}</dd>
          </div>
        )}
        <div className="inline-flex items-center gap-1.5">
          <dt className="sr-only">Posted by</dt>
          <UserRound className="size-3.5" aria-hidden />
          <dd>Posted by {event.postedBy}</dd>
        </div>
      </dl>

      {footer && <div className="mt-4">{footer}</div>}
    </article>
  );
}
