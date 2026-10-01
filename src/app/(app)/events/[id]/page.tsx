import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { DeleteEventButton } from "@/components/delete-event-button";
import { EventCard } from "@/components/event-card";
import { EventLocationMap } from "@/components/event-location-map";
import { EventsOff } from "@/components/events-off";
import { NoVillage } from "@/components/no-village";
import { requireSession } from "@/lib/auth";
import { isCoordinatorRole } from "@/lib/constants";
import { canDeleteEvent, getVillageEvent, getVillageEventsEnabled } from "@/lib/events";

export const metadata: Metadata = { title: "Event" };

/**
 * One event. An id from another village is a 404 rather than a 403, for the
 * reason the vote route gives: a 403 would confirm the event exists somewhere.
 */
export default async function EventPage({
  params,
}: {
  // Next 16: a Promise.
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireSession(`/events/${id}`);
  const villageId = session.profile?.villageId;

  if (!villageId) return <NoVillage />;

  const coordinator = isCoordinatorRole(session.profile?.role);

  if (!(await getVillageEventsEnabled(villageId))) {
    return <EventsOff coordinator={coordinator} />;
  }

  const event = await getVillageEvent(villageId, id);
  if (!event) notFound();

  const over = new Date(event.endsAt ?? event.startsAt) < new Date();
  const mayDelete = canDeleteEvent(session, event);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/events"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-700"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All events
      </Link>

      <div className="mt-4">
        <EventCard event={event} past={over} />
      </div>

      {event.lat !== null && event.lng !== null && (
        <section className="mt-6">
          <EventLocationMap
            event={{
              id: event.id,
              title: event.title,
              category: event.category,
              locationText: event.locationText,
              startsAt: event.startsAt,
              endsAt: event.endsAt,
              lat: event.lat,
              lng: event.lng,
            }}
          />
          <p className="mt-2 text-xs text-slate-500">
            The pin is placed near the spot rather than on it, so that an event
            at somebody&rsquo;s home does not point at the house.
          </p>
        </section>
      )}

      {mayDelete && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-900">Actions</h2>
          <div className="mt-3">
            <DeleteEventButton
              eventId={event.id}
              asCoordinator={coordinator && event.createdById !== session.user.id}
            />
          </div>
        </section>
      )}
    </div>
  );
}
