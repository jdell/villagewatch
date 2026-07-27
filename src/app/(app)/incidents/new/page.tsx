import type { Metadata } from "next";
import Link from "next/link";
import { MapPinOff } from "lucide-react";
import { IncidentForm } from "@/components/incident-form";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getVillageChannel } from "@/lib/whatsapp-channel";
import { MAP_DEFAULTS, isCoordinatorRole } from "@/lib/constants";

export const metadata: Metadata = { title: "Report an incident" };

/**
 * Host for the report wizard.
 *
 * The village is looked up here, on the server, so the map centre and the
 * tenant the report will be filed against both come from the session rather
 * than from anything the browser could set. The wizard itself is a Client
 * Component — it owns Leaflet, the camera and the on-device blur.
 */
export default async function NewIncidentPage() {
  const session = await requireSession("/incidents/new");

  const village =
    session.profile?.villageId && process.env.DATABASE_URL
      ? await prisma.village.findUnique({
          where: { id: session.profile.villageId },
          select: {
            id: true,
            name: true,
            centerLat: true,
            centerLng: true,
            defaultZoom: true,
            // Read here so the wizard can tell the reporter the truth about
            // what pressing publish does. It is *display only* — the route
            // reads the column again server-side and decides the status from
            // that, so a browser that lies about it changes nothing.
            autoApprove: true,
          },
        })
      : null;

  if (!village) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
            <MapPinOff className="size-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">
            You are not in a village yet
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            Reports belong to a village, so there is nowhere to file this one
            until you have joined. Your coordinator can give you a join code.
          </p>
          <Link
            href="/settings"
            className="mt-5 inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Go to settings
          </Link>
        </div>
      </div>
    );
  }

  // Only ever used by the success screen's "Open WhatsApp" button, which only a
  // coordinator filing into an auto-approving village ever sees — so it is read
  // only for them. `getVillageChannel` is the `https:`-checked view, because
  // this ends up in an `href`.
  const canPostAlert = isCoordinatorRole(session.profile?.role);
  const channel = canPostAlert ? await getVillageChannel(village.id) : null;

  return (
    <IncidentForm
      village={{
        id: village.id,
        name: village.name,
        centerLat: village.centerLat,
        centerLng: village.centerLng,
        defaultZoom: village.defaultZoom || MAP_DEFAULTS.zoom,
        autoApprove: village.autoApprove,
        channelUrl: channel?.url ?? null,
      }}
      canPostAlert={canPostAlert}
    />
  );
}
