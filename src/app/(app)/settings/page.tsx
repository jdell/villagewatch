import type { Metadata } from "next";
import {
  BellRing,
  ClipboardCheck,
  FileText,
  LogOut,
  MapPin,
  MessageCircle,
  QrCode,
  Settings2,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
  EyeOff,
} from "lucide-react";
import { CoordinatorApplication } from "@/components/coordinator-application";
import { FlashToast } from "@/components/flash-toast";
import { ProfileCard } from "@/components/you/profile-card";
import { ReplayTourRow } from "@/components/you/replay-tour-row";
import { SettingsGroup, SettingsRow } from "@/components/you/settings-list";
import { requireSession } from "@/lib/auth";
import { getLatestCoordinatorRequest } from "@/lib/coordinator-requests";
import { prisma } from "@/lib/prisma";
import { getVillageChannel } from "@/lib/whatsapp-channel";
import { daysSince, RADIUS_STOPS, radiusStop } from "@/lib/you";
import { readYouStats } from "@/lib/you-stats";
import {
  APP_NAME,
  SEVERITY_LABELS,
  USER_ROLE_LABELS,
  VERSION_LABEL,
  canApplyForCoordinator,
  isCoordinatorRole,
} from "@/lib/constants";

export const metadata: Metadata = { title: "You" };

/**
 * "You" — the Settings tab, redesigned as a page about the resident rather
 * than a form. A profile card, the coordinator application, then grouped rows
 * that each say the current value and push to a sub-page to change it:
 * `/settings/profile`, `/settings/notifications`, `/settings/account`.
 *
 * Nothing on this page writes. Every control lives on a sub-page with its own
 * form and its own Save, so there is never a half-edited screen to leave. Role
 * and village are shown and never editable — both are set by server code from a
 * verified join code or a coordinator action (domain rule 5); asking for a
 * different role is the coordinator application, a form on its own page.
 *
 * `(app)/layout.tsx` forces this route dynamic, so a resident who has just
 * saved on a sub-page comes back to the value they saved.
 */
export default async function YouPage({
  searchParams,
}: {
  // Next 16: `searchParams` is a Promise and has to be awaited.
  searchParams: Promise<{ applied?: string }>;
}) {
  const session = await requireSession("/settings");
  const profile = session.profile;
  const villageId = profile?.villageId ?? null;
  const coordinator = isCoordinatorRole(profile?.role);
  const canApply = canApplyForCoordinator(profile?.role);

  // Every read keyed on the session — the user id or the village off the
  // profile, never anything from the request (domain rule 4).
  const [{ applied }, village, channel, coordinatorRequest, stats] =
    await Promise.all([
      searchParams,
      villageId
        ? prisma.village
            .findUnique({ where: { id: villageId }, select: { name: true } })
            .catch(() => null)
        : null,
      villageId ? getVillageChannel(villageId) : null,
      // A coordinator's own old application is history they have no use for.
      canApply ? getLatestCoordinatorRequest(session.user.id) : null,
      readYouStats(session.user.id),
    ]);

  const radius = RADIUS_STOPS[radiusStop(profile?.notifyRadiusMeters ?? null)];
  const notificationsSummary = [
    profile?.notifyPush ? "Push" : null,
    profile?.notifyEmail ? "Email" : null,
  ]
    .filter(Boolean)
    .join(" & ");

  return (
    <div className="min-h-full bg-[#f1f5f9] lg:bg-transparent">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 lg:px-6 lg:py-8">
        {/* Set by the redirect at the end of `applyForCoordinatorAction`. */}
        {applied === "1" && (
          <FlashToast message="Application sent. We will let you know." />
        )}

        <h1 className="px-1 text-[28px] font-[750] tracking-tight text-[#0f172a]">
          You
        </h1>

        <ProfileCard
          name={profile?.fullName ?? ""}
          roleLabel={profile?.role ? USER_ROLE_LABELS[profile.role] : null}
          villageName={village?.name ?? null}
          verified={Boolean(profile?.verifiedAt)}
          stats={[
            { label: "Reports filed", value: stats.reportsFiled },
            { label: "Rated", value: stats.rated },
            {
              label: "Days a member",
              value: profile ? daysSince(profile.createdAt, new Date()) : null,
            },
          ]}
        />

        {canApply && villageId && (
          <CoordinatorApplication request={coordinatorRequest} />
        )}

        <SettingsGroup title="Profile" id="profile">
          <SettingsRow
            icon={UserRound}
            label="Name"
            value={profile?.fullName || "Not set"}
            href="/settings/profile"
          />
          <SettingsRow
            icon={MapPin}
            label="Street or area"
            value={profile?.addressLine || "Not set"}
            href="/settings/profile"
          />
          {/*
            Not a switch, because there is nothing for one to change: no
            neighbour has ever been shown who filed a report, and a coordinator
            always is — see "Filing anonymously". A toggle here would be a
            control that moves nothing, so this says what is true instead.
          */}
          <SettingsRow
            icon={EyeOff}
            label="Filing anonymously"
            detail="Always, to your neighbours. Your coordinator sees who filed, so they can follow up."
          />
          <SettingsRow
            icon={FileText}
            label="Email"
            value={session.user.email ?? ""}
            href="/settings/account"
          />
        </SettingsGroup>

        <SettingsGroup title="Notifications" id="notifications">
          <SettingsRow
            icon={BellRing}
            iconTile="bg-[#f0f9ff] text-[#0284c7]"
            label="Alerts"
            detail={
              notificationsSummary
                ? `${notificationsSummary} · ${SEVERITY_LABELS[profile?.notifyMinSeverity ?? "LOW"]} and above · ${radius.label.toLowerCase()}`
                : "Off — you will not be told about new reports"
            }
            href="/settings/notifications"
          />
        </SettingsGroup>

        {villageId && (
          <SettingsGroup
            title="Village"
            id="village"
            footer={
              channel?.url
                ? "A WhatsApp Channel is public: anyone with the link can read it. Posts carry a headline, an area and a link — never your name, your wording, or the exact spot."
                : undefined
            }
          >
            {channel?.url ? (
              <SettingsRow
                icon={MessageCircle}
                iconTile="bg-[#f0fdf4] text-[#16a34a]"
                label="WhatsApp Channel"
                detail="Follow the village's serious alerts outside the app"
                href={channel.url}
                external
              />
            ) : (
              <SettingsRow
                icon={MessageCircle}
                label="WhatsApp Channel"
                detail={
                  coordinator
                    ? "Not set up yet — set one up in village settings"
                    : "Not set up yet"
                }
                href={coordinator ? "/dashboard/settings#channels" : undefined}
              />
            )}
          </SettingsGroup>
        )}

        {/*
          The coordinator's shortcuts into their own village's settings. The
          sidebar has all of them from `lg` up; on a phone the tab bar has none,
          and these four are the ones a coordinator reaches for from a phone.
        */}
        {coordinator && (
          <SettingsGroup title="Coordinator" id="coordinator">
            <SettingsRow
              icon={Settings2}
              iconTile="bg-[#0f172a] text-white"
              label="Village settings"
              href="/dashboard/settings"
            />
            <SettingsRow
              icon={Users}
              label="Residents"
              href="/dashboard/settings#residents"
            />
            <SettingsRow icon={QrCode} label="Invite" href="/dashboard/settings#invite" />
            <SettingsRow
              icon={ClipboardCheck}
              label="Compliance"
              href="/dashboard/compliance"
            />
          </SettingsGroup>
        )}

        <SettingsGroup>
          <ReplayTourRow />
          <SettingsRow icon={ShieldCheck} label="Privacy notice" href="/privacy" />
          <SettingsRow icon={FileText} label="Terms of use" href="/terms" />
        </SettingsGroup>

        <SettingsGroup>
          {/*
            A real POST to the logout route, so the Supabase cookies are cleared
            by a route handler rather than by client code that might not run.
            The form is below; the row submits it by id.
          */}
          <SettingsRow icon={LogOut} label="Sign out" formId="sign-out" />
          <SettingsRow
            icon={Trash2}
            iconTile="bg-[#fef2f2] text-[#b91c1c]"
            label="Delete my account"
            tone="danger"
            href="/settings/account"
          />
        </SettingsGroup>

        <form id="sign-out" action="/api/auth/logout" method="post" />

        {/*
          The build, named in full rather than as a bare number — the one a
          resident is asked to read out to whoever is helping them.
        */}
        {VERSION_LABEL && (
          <p className="text-center text-xs text-[#94a3b8]">
            {APP_NAME} {VERSION_LABEL}
          </p>
        )}
      </div>
    </div>
  );
}
