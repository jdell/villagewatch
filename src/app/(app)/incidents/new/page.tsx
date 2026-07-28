import type { Metadata } from "next";
import Link from "next/link";
import { MapPinOff, ShieldAlert } from "lucide-react";
import { IncidentForm } from "@/components/incident-form";
import { requireSession } from "@/lib/auth";
import {
  COMPLIANCE_BLOCKED_MESSAGE,
  getVillageCompliance,
} from "@/lib/compliance";
import { prisma } from "@/lib/prisma";
import { getVillagePrivacyLevel } from "@/lib/village";
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

  const canPostAlert = isCoordinatorRole(session.profile?.role);

  /*
    The compliance gate, rendered rather than enforced — `POST /api/incidents`
    is what actually refuses (see `src/lib/compliance.ts`). Showing this here is
    what stops a resident filling in a five-step wizard, attaching a photo,
    waiting for the rewrite and only then being told their village cannot accept
    it.

    A coordinator gets a way through to fix it; a resident gets the sentence and
    a way back, because there is nothing they can do and pointing them at a page
    that would refuse them would be worse than saying so.
  */
  const compliance = await getVillageCompliance(village.id);

  if (!compliance.complete) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
          <span className="mx-auto grid size-12 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
            <ShieldAlert className="size-6" aria-hidden />
          </span>
          <h1 className="mt-4 text-xl font-semibold text-slate-900">
            Reporting is not open yet
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {COMPLIANCE_BLOCKED_MESSAGE}
          </p>

          {canPostAlert ? (
            <>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                That is you. {village.name} needs its Data Protection Impact
                Assessment, Appropriate Policy Document and Data Processing
                Agreement accepted before it can take a single report.
              </p>
              <Link
                href="/dashboard/compliance"
                className="mt-5 inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                Complete compliance setup
              </Link>
            </>
          ) : (
            <Link
              href="/map"
              className="mt-5 inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white transition hover:bg-brand-700"
            >
              Back to the map
            </Link>
          )}

          <p className="mt-5 text-xs leading-relaxed text-slate-500">
            If this is an emergency, call 999. For non-urgent police matters,
            call 101.
          </p>
        </div>
      </div>
    );
  }

  // Only ever used by the success screen's "Open WhatsApp" button, which only a
  // coordinator filing into an auto-approving village ever sees — so it is read
  // only for them. `getVillageChannel` is the `https:`-checked view, because
  // this ends up in an `href`.
  const channel = canPostAlert ? await getVillageChannel(village.id) : null;

  /*
    How this village covers faces. Read through its own function rather than
    added to the `select` above, because `privacy_level` arrives with a
    migration and a plain select naming a column that does not exist throws for
    the whole statement — which would take the wizard down rather than the
    setting. Unlike `autoApprove` above this is *not* display-only: the blur
    runs in the browser, so this value is what the uploader actually applies.
    There is no server-side check behind it and there cannot be one, because the
    original never reaches the server (domain rule 3). What bounds it is the
    scale itself: every level covers every face, and the mosaic that does the
    covering is not on the scale.
  */
  const privacyLevel = await getVillagePrivacyLevel(village.id);

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
        privacyLevel: privacyLevel.value,
      }}
      canPostAlert={canPostAlert}
    />
  );
}
