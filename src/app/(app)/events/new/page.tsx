import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EventForm } from "@/components/event-form";
import { EventsOff } from "@/components/events-off";
import { NoVillage } from "@/components/no-village";
import { requireSession } from "@/lib/auth";
import { isCoordinatorRole, MAP_DEFAULTS } from "@/lib/constants";
import { getVillageEventsEnabled } from "@/lib/events";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Post an event" };

/**
 * The event form's host. It reads the village's map centre so the pin picker
 * opens over the right place; the switch is checked here so nobody fills the
 * form in to be refused, and checked again by `POST /api/events`, which is the
 * check that counts.
 */
export default async function NewEventPage() {
  const session = await requireSession("/events/new");
  const villageId = session.profile?.villageId;

  if (!villageId) return <NoVillage />;

  if (!(await getVillageEventsEnabled(villageId))) {
    return <EventsOff coordinator={isCoordinatorRole(session.profile?.role)} />;
  }

  const village = await prisma.village.findUnique({
    where: { id: villageId },
    select: { name: true, centerLat: true, centerLng: true, defaultZoom: true },
  });

  if (!village) return <NoVillage />;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <Link
        href="/events"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-700"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All events
      </Link>

      <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">
        Post an event
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Something happening in {village.name} that the village should know about.
        For anything that worries you, file a report instead.
      </p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <EventForm
          center={{ lat: village.centerLat, lng: village.centerLng }}
          zoom={village.defaultZoom || MAP_DEFAULTS.zoom}
        />
      </div>
    </div>
  );
}
