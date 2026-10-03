import type { Metadata } from "next";
import { NotificationsForm } from "@/components/you/notifications-form";
import { SubPageBar } from "@/components/you/sub-page-bar";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Notifications" };

/**
 * How a resident hears about things — one of the sub-pages of "You".
 *
 * The radius preview is drawn around the resident's own approximate home
 * location (`homeLat`/`homeLng`, fuzzed when stored), and only on their own
 * screen. With none there is nothing to measure from, and the form says so.
 */
export default async function NotificationSettingsPage() {
  const session = await requireSession("/settings/notifications");
  const profile = session.profile;

  const home =
    profile?.homeLat != null && profile?.homeLng != null
      ? { lat: profile.homeLat, lng: profile.homeLng }
      : null;

  return (
    <div className="min-h-full bg-[#f1f5f9] lg:bg-transparent">
      <div className="mx-auto w-full max-w-2xl lg:px-6 lg:py-8">
        <SubPageBar title="Notifications" />
        <div className="px-4 pt-4 pb-8 lg:px-0">
          <NotificationsForm
            notifyPush={profile?.notifyPush ?? true}
            notifyEmail={profile?.notifyEmail ?? true}
            notifyMinSeverity={profile?.notifyMinSeverity ?? "LOW"}
            notifyRadiusMeters={profile?.notifyRadiusMeters ?? null}
            home={home}
          />
        </div>
      </div>
    </div>
  );
}
