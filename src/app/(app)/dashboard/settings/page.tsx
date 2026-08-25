import type { Metadata } from "next";
import Link from "next/link";
import { MessageCircle, ShieldCheck, Users } from "lucide-react";
import { AutoApproveForm } from "@/components/dashboard/auto-approve-form";
import { InviteShare } from "@/components/dashboard/invite-share";
import { ParishCouncilForm } from "@/components/dashboard/parish-council-form";
import { PrivacyLevelForm } from "@/components/dashboard/privacy-level-form";
import {
  ResidentList,
  type ResidentRow,
} from "@/components/dashboard/resident-list";
import { VillageModeForm } from "@/components/dashboard/village-mode-form";
import { WhatsAppChannelForm } from "@/components/dashboard/whatsapp-channel-form";
import { NoVillage } from "@/components/no-village";
import { requireCoordinator } from "@/lib/auth";
import { getVillageCompliance } from "@/lib/compliance";
import { prisma } from "@/lib/prisma";
import {
  getVillageParishCouncil,
  getVillagePrivacyLevel,
  listVillageResidents,
} from "@/lib/villages";
import { getVillageChannelSettings } from "@/lib/whatsapp-channel";
import {
  RESIDENT_LIST_SIZE,
  VILLAGE_MODES,
  VILLAGE_STATUS_LABELS,
} from "@/lib/constants";
import { getVillageAutoApprove } from "@/lib/moderation";

export const metadata: Metadata = { title: "Village settings" };

/**
 * Everything that applies to the whole village, on one screen instead of buried
 * under the review queue.
 *
 * These were the bottom third of the old `/dashboard`: five forms and the
 * invite panel, three scrolls below the queue they govern. The auto-approve
 * switch in particular decides whether the village moderates at all, and it sat
 * adjacent to buttons a coordinator presses twenty times a week. See
 * `docs/COORDINATOR_DASHBOARD_REDESIGN.md`.
 *
 * Four groups, in the order somebody sets a village up: what the village *is*,
 * how people get into it, who is in it, and what leaves it.
 *
 * Everything here is coordinator-only and scoped to the coordinator's own
 * village from the session profile (domain rule 4). The forms are unchanged —
 * they were already separate forms with separate actions and separate audit
 * rows, which is what made moving them a move rather than a rewrite.
 */
export default async function VillageSettingsPage() {
  const session = await requireCoordinator("/dashboard/settings");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return <NoVillage />;
  }

  const [
    village,
    channel,
    autoApprove,
    parishCouncil,
    privacyLevel,
    compliance,
    residents,
  ] = await Promise.all([
    // The join code is read here and only here in the authenticated app — this
    // is the screen that hands it out, to the coordinator whose village it is.
    // See `InviteShare` for why that is not the decision `/admin/villages` made.
    prisma.village.findUnique({
      where: { id: villageId },
      select: {
        name: true,
        slug: true,
        region: true,
        status: true,
        joinCode: true,
      },
    }),
    // The raw column values rather than `getVillageChannel`'s filtered view —
    // this is the screen that edits them, so a stored link that failed the
    // `https:` check has to appear in the field to be correctable.
    getVillageChannelSettings(villageId),
    getVillageAutoApprove(villageId),
    // Reports whether the column exists as well as what is in it — the form
    // renders a different thing for each, because "no council named" is the
    // coordinator's to fix and "no column to name one in" is not.
    getVillageParishCouncil(villageId),
    // Same two-part answer again, and the same reason — except that the value
    // is never null here: it ends up as a redaction mode, and there is no state
    // in which the right answer is to cover nothing.
    getVillagePrivacyLevel(villageId),
    // For `mode`, which decides what the controller field calls itself and
    // whether the upgrade form has anything to offer.
    getVillageCompliance(villageId),
    listVillageResidents(villageId, RESIDENT_LIST_SIZE),
  ]);

  if (!village) return <NoVillage />;

  const residentRows: ResidentRow[] = residents.residents.map((resident) => ({
    id: resident.id,
    fullName: resident.fullName,
    email: resident.email,
    role: resident.role,
    // ISO strings — a `Date` does not cross into a Client Component intact.
    verifiedAt: resident.verifiedAt?.toISOString() ?? null,
    createdAt: resident.createdAt.toISOString(),
    deletedAt: resident.deletedAt?.toISOString() ?? null,
    publishedReports: resident.publishedReports,
  }));

  const modeLabel = VILLAGE_MODES.find(
    (option) => option.value === compliance.mode,
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Village settings
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        These apply to everyone in {village.name}, not just to you.
      </p>

      {/* ---------------------------------------------------------------- */}

      <section id="village-profile" className="mt-8">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <ShieldCheck className="size-5 text-slate-400" aria-hidden />
          Village profile
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          What your village is, and who answers for it.
        </p>

        {/*
          Read-only, and deliberately. A village is a directory entry seeded from
          the ONS Index of Place Names, and its name, slug and map centre are
          what a resident recognises when they pick it at registration —
          `/admin/villages` is where they change, because changing one is a
          platform act rather than a village one.
        */}
        <dl className="mt-4 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-3 sm:p-5">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Name
            </dt>
            <dd className="mt-1 text-sm font-medium text-slate-900">
              {village.name}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Area
            </dt>
            <dd className="mt-1 text-sm text-slate-700">
              {village.region ?? "Not recorded"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wider text-slate-400">
              Status
            </dt>
            <dd className="mt-1 text-sm text-slate-700">
              {VILLAGE_STATUS_LABELS[village.status]}
              {modeLabel && <> · {modeLabel.label}</>}
            </dd>
          </div>
        </dl>

        {/*
          The controller first, because it is the one setting here that changes
          nothing about how reports flow — it is a name on a document.

          `compliance.mode` decides what this card calls itself: a community
          village has no parish council to name, and its coordinator is the
          controller. Taken off the compliance read this page already does
          rather than a second query — and it is defined on both halves of
          `ComplianceStatus`, including the one where the column is missing.
        */}
        <ParishCouncilForm
          value={parishCouncil.value}
          available={parishCouncil.available}
          mode={compliance.mode}
        />

        {/*
          Whether the village moderates at all. It kept its own warning rather
          than relying on being next to the channel form — on the old page the
          two were adjacent so that a village running both could be seen at a
          glance, and here the invite and resident sections sit between them.
        */}
        <AutoApproveForm value={autoApprove} />

        {/*
          Handing the village to a parish council. One direction, and the copy
          says so.

          It was only reachable from `/dashboard/compliance` before, which is a
          screen a coordinator visits once. "What model is my village on" is a
          profile question, so it is answerable from the profile — and the
          component is the same one, with the same one-way write behind it.

          Gated exactly as it is there: community mode only, and only where the
          column exists. A council village has nowhere to upgrade to, and a
          database missing `mode` cannot record the decision — rendering the
          form in either case offers a button that can only fail.
        */}
        {compliance.available && compliance.mode === "community" && (
          <div className="mt-4">
            <VillageModeForm village={village.name} />
          </div>
        )}
      </section>

      {/* ---------------------------------------------------------------- */}

      <section id="invite" className="mt-10">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <Users className="size-5 text-slate-400" aria-hidden />
          Residents
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          How people get into your village, and who is already in it.
        </p>

        {/*
          The invite above the list, which is the order they are used in: a
          village with nobody in it needs the link, and the list is what it
          fills up with.
        */}
        <InviteShare
          villageName={village.name}
          slug={village.slug}
          region={village.region}
          joinCode={village.joinCode}
        />

        <ResidentList
          residents={residentRows}
          total={residents.total}
          currentUserId={session.user.id}
        />
      </section>

      {/* ---------------------------------------------------------------- */}

      <section id="channels" className="mt-10">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <MessageCircle className="size-5 text-slate-400" aria-hidden />
          Channels and privacy
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          What leaves your village, and what is left of a face in a photo when it
          does.
        </p>

        <WhatsAppChannelForm
          values={{
            url: channel?.url ?? null,
            enabled: channel?.enabled ?? false,
            // The column default, and deliberately higher than the push
            // default — a public feed is not the place for a missing cat.
            minSeverity: channel?.minSeverity ?? "HIGH",
          }}
        />

        {/*
          Named rather than rendered as a disabled form. There is no Telegram
          column, no validator and no module behind it; a greyed-out field for a
          thing that does not exist is a promise, and this codebase has enough
          of those written down in `BACKLOG.md` where they can be scheduled.
        */}
        <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-3 text-xs leading-relaxed text-slate-500 ring-1 ring-inset ring-slate-200">
          WhatsApp is the only channel today. Nothing posts to it automatically —
          approving a report gives you the alert to paste. Telegram and a parish
          mailing list are not built yet.
        </p>

        {/*
          The other axis: not who reads a report, but what is left of a
          bystander in the photo attached to it. It is the only setting here
          whose subject never used the app and never agreed to anything.
        */}
        <PrivacyLevelForm
          value={privacyLevel.value}
          available={privacyLevel.available}
        />
      </section>

      <p className="mt-10 text-sm text-slate-500">
        Looking for the compliance documents?{" "}
        <Link
          href="/dashboard/compliance"
          className="font-medium text-brand-700 underline underline-offset-2"
        >
          They are on their own page
        </Link>
        , because accepting one is a legal act rather than a setting.
      </p>
    </div>
  );
}
