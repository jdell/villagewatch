import type { Metadata } from "next";
import { CoordinatorApplication } from "@/components/coordinator-application";
import { DeleteAccount } from "@/components/delete-account";
import { FlashToast } from "@/components/flash-toast";
import { SettingsForm } from "@/components/settings-form";
import { requireSession } from "@/lib/auth";
import { getLatestCoordinatorRequest } from "@/lib/coordinator-requests";
import { getVillageChannel } from "@/lib/whatsapp-channel";
import {
  APP_NAME,
  canApplyForCoordinator,
  isCoordinatorRole,
  USER_ROLE_LABELS,
  VERSION_LABEL,
} from "@/lib/constants";

export const metadata: Metadata = { title: "Settings" };

/**
 * Profile, notification preferences and the sign-out button.
 *
 * The form's initial values come from the session profile, which is read
 * server-side on every request — `(app)/layout.tsx` forces this route dynamic,
 * so a resident who just saved never sees a cached copy of their old settings.
 *
 * Role and village are shown but not editable: both are set by server code from
 * a verified join code or a coordinator action (domain rule 5). Asking to have
 * the role changed is the one thing this screen can start, and it starts it by
 * linking to `/coordinator-apply` rather than by putting a role field on a form
 * — see `CoordinatorApplication`.
 */
export default async function SettingsPage({
  searchParams,
}: {
  // Next 16: `searchParams` is a Promise and has to be awaited.
  searchParams: Promise<{ applied?: string }>;
}) {
  const session = await requireSession("/settings");
  const profile = session.profile;

  // A resident with no village has no channel to follow — `getVillageChannel`
  // is scoped by the village id off the session profile and never by anything
  // that arrived in a request (domain rule 4).
  const [{ applied }, channel, coordinatorRequest] = await Promise.all([
    searchParams,
    profile?.villageId ? getVillageChannel(profile.villageId) : null,
    // Only read for someone who could still apply. A coordinator's own old
    // application is history they have no use for on this screen.
    canApplyForCoordinator(profile?.role)
      ? getLatestCoordinatorRequest(session.user.id)
      : null,
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 sm:py-10">
      {/* Set by the redirect at the end of `applyForCoordinatorAction`. */}
      {applied === "1" && (
        <FlashToast message="Application sent. We will let you know." />
      )}

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
        channel={
          // `null` only where the resident has no village at all. Everyone else
          // sees the section — with the follow link if their village runs a
          // channel, and "not set up yet" if it does not. A coordinator also
          // gets the way through to the dashboard form that sets one up.
          profile?.villageId
            ? {
                url: channel?.url ?? null,
                canSetUp: isCoordinatorRole(profile?.role),
              }
            : null
        }
      />

      {/*
        Outside SettingsForm, and below the save button, because it is not a
        setting: applying is a form on its own page and the state shown here is
        the outcome of one. Rendered only for a resident with a village — there
        is nothing to coordinate without one.
      */}
      {canApplyForCoordinator(profile?.role) && profile?.villageId && (
        <div className="mt-4">
          <CoordinatorApplication request={coordinatorRequest} />
        </div>
      )}

      {/*
        Last on the page, and the only thing below the save button that is not
        an outcome of it. Rendered for everyone with an email — which is
        everyone, since it is the sign-in address — because the right to erasure
        does not depend on having joined a village yet.
      */}
      {session.user.email && <DeleteAccount email={session.user.email} />}

      {/*
        Sits outside SettingsForm because HTML forbids nested forms — the button
        inside the settings form targets it by id. It is a real POST to the
        logout route so the Supabase cookies are cleared by a route handler
        rather than by client code that might not run.
      */}
      <form id="sign-out" action="/api/auth/logout" method="post" />

      {/*
        The build, named in full rather than as a bare `v0.1.24`. This is the
        one a resident is asked to read out to whoever is helping them, and
        "VillageWatch 0.1.24" survives being repeated over the phone in a way a
        number on its own does not. Nothing renders on a build with no version.
      */}
      {VERSION_LABEL && (
        <p className="mt-10 text-center text-xs text-slate-400">
          {APP_NAME} {VERSION_LABEL}
        </p>
      )}
    </div>
  );
}
