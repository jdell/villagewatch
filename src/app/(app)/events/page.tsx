import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, CalendarPlus } from "lucide-react";
import { EventCard } from "@/components/event-card";
import { EventsOff } from "@/components/events-off";
import { NoVillage } from "@/components/no-village";
import { requireSession } from "@/lib/auth";
import { isCoordinatorRole } from "@/lib/constants";
import { getVillageEventsEnabled, listVillageEvents } from "@/lib/events";

export const metadata: Metadata = { title: "Events" };

/**
 * What is on in the village. Upcoming soonest first; past events under a fold,
 * because the page is a calendar and last month's litter pick is history
 * rather than news. Every read is the caller's own village (domain rule 4).
 */
export default async function EventsPage() {
  const session = await requireSession("/events");
  const villageId = session.profile?.villageId;

  if (!villageId) return <NoVillage />;

  const coordinator = isCoordinatorRole(session.profile?.role);

  if (!(await getVillageEventsEnabled(villageId))) {
    return <EventsOff coordinator={coordinator} />;
  }

  const { upcoming, past } = await listVillageEvents(villageId, new Date());

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Events
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            What is on in the village — posted by your neighbours.
          </p>
        </div>
        <Link
          href="/events/new"
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          <CalendarPlus className="size-4" aria-hidden />
          Post an event
        </Link>
      </div>

      {upcoming.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <span className="mx-auto grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <CalendarDays className="size-5" aria-hidden />
          </span>
          <h2 className="mt-3 text-base font-semibold text-slate-900">
            Nothing coming up
          </h2>
          <p className="mt-1.5 text-sm text-slate-600">
            Organising a litter pick or a get-together? Post it here and the
            village will see it on the map.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {upcoming.map((event) => (
            <li key={event.id}>
              <EventCard compact event={event} href={`/events/${event.id}`} />
            </li>
          ))}
        </ul>
      )}

      {past.length > 0 && (
        <details className="group mt-8">
          <summary className="cursor-pointer select-none text-sm font-semibold text-slate-700 hover:text-slate-900">
            Past events ({past.length})
          </summary>
          <ul className="mt-3 space-y-3">
            {past.map((event) => (
              <li key={event.id}>
                <EventCard compact past event={event} href={`/events/${event.id}`} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
