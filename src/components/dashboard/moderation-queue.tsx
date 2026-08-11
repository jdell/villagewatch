"use client";

import { useCallback, useState } from "react";
import { X } from "lucide-react";
import { CopyAlert } from "@/components/copy-alert";
import {
  ModerationCard,
  type PublishedAlert,
  type QueuedIncident,
} from "@/components/dashboard/moderation-card";

/**
 * The moderation queue, and the alerts for what has just come out of it.
 *
 * It exists for one reason: **state has to outlive the card that produced it.**
 * `moderateIncidentAction` revalidates `/dashboard`, so an approved report
 * leaves `PENDING_REVIEW` and its `ModerationCard` unmounts on the very next
 * render. The WhatsApp alert that approval produced would go with it, which
 * would be a copy button that flashes past on the way to disappearing.
 *
 * This component sits above the list and is not re-keyed by it, so React keeps
 * it mounted across the revalidation and the alerts it is holding stay on
 * screen — until the coordinator dismisses them or leaves the page. Nothing is
 * persisted: the same text is on the incident's own page for as long as the
 * report exists, so an accidental dismissal costs one click, not the alert.
 *
 * Newest first, because a coordinator working through a queue posts in the order
 * they approved and the one they just did is the one they want.
 */
export function ModerationQueue({
  incidents,
  channelUrl,
  empty,
}: {
  incidents: readonly QueuedIncident[];
  /** The village's channel invite link, already `https:`-checked server-side. */
  channelUrl: string | null;
  /**
   * Rendered in place of the list when there is nothing waiting. Passed in from
   * the server component so the empty state can stay markup rather than becoming
   * a second client component.
   */
  empty?: React.ReactNode;
}) {
  const [alerts, setAlerts] = useState<PublishedAlert[]>([]);

  const handlePublished = useCallback((alert: PublishedAlert) => {
    setAlerts((current) =>
      // Guarded rather than assumed unique: an action state can be replayed by a
      // remount, and two panels for one report is a coordinator posting twice.
      current.some((item) => item.incidentId === alert.incidentId)
        ? current
        : [alert, ...current],
    );
  }, []);

  function dismiss(incidentId: string) {
    setAlerts((current) =>
      current.filter((item) => item.incidentId !== incidentId),
    );
  }

  return (
    <>
      {alerts.length > 0 && (
        <ul className="mt-4 space-y-3">
          {alerts.map((alert) => (
            <li key={alert.incidentId} className="relative">
              <CopyAlert
                text={alert.text}
                incidentId={alert.incidentId}
                channelUrl={channelUrl}
                anonymized={alert.anonymized}
                title={`${alert.reference} is published — post it to WhatsApp`}
                hint="Your neighbours have been alerted in the app. Nothing is posted to your channel automatically — copy this and paste it there."
              />
              <button
                type="button"
                onClick={() => dismiss(alert.incidentId)}
                className="absolute right-3 top-3 grid size-7 place-items-center rounded-lg text-slate-400 transition hover:bg-white hover:text-slate-600"
              >
                <X className="size-4" aria-hidden />
                <span className="sr-only">
                  Dismiss the alert for {alert.reference}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {incidents.length === 0 ? (
        empty
      ) : (
        <ul className="mt-4 space-y-3">
          {incidents.map((incident) => (
            <li key={incident.id}>
              <ModerationCard
                incident={incident}
                onPublished={handlePublished}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
