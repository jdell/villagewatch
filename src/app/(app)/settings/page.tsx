import type { Metadata } from "next";
import { SettingsForm } from "@/components/settings-form";
import { requireSession } from "@/lib/auth";
import { getVillageChannel } from "@/lib/whatsapp-channel";
import { isCoordinatorRole, USER_ROLE_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Settings" };

/**
 * Profile, notification preferences and the sign-out button.
 *
 * The form's initial values come from the session profile, which is read
 * server-side on every request — `(app)/layout.tsx` forces this route dynamic,
 * so a resident who just saved never sees a cached copy of their old settings.
 *
 * Role and village are shown but not editable: both are set by server code from
 * a verified join code or a coordinator action (domain rule 5).
 */
export default async function SettingsPage() {
  const session = await requireSession("/settings");
  const profile = session.profile;

  // A resident with no village has no channel to follow — `getVillageChannel`
  // is scoped by the village id off the session profile and never by anything
  // that arrived in a request (domain rule 4).
  const channel = profile?.villageId
    ? await getVillageChannel(profile.villageId)
    : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Settings
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Your profile, and exactly how much you want to be told.
      </p>

      {profile?.role && (
        <p className="mt-3 inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
          {USER_ROLE_LABELS[profile.role]}
          {profile.verifiedAt ? " · verified" : " · not yet verified"}
        </p>
      )}

      <SettingsForm
        values={{
          fullName: profile?.fullName ?? "",
          email: session.user.email ?? "",
          addressLine: profile?.addressLine ?? "",
          notifyPush: profile?.notifyPush ?? true,
          notifyMinSeverity: profile?.notifyMinSeverity ?? "LOW",
          notifyRadiusMeters: profile?.notifyRadiusMeters ?? null,
        }}
        channel={{
          url: channel?.url ?? null,
          // Residents with no channel to follow see nothing; a coordinator sees
          // the prompt, because they are the one who can go and create one.
          canSetUp: isCoordinatorRole(profile?.role),
        }}
      />

      {/*
        Sits outside SettingsForm because HTML forbids nested forms — the button
        inside the settings form targets it by id. It is a real POST to the
        logout route so the Supabase cookies are cleared by a route handler
        rather than by client code that might not run.
      */}
      <form id="sign-out" action="/api/auth/logout" method="post" />
    </div>
  );
}
