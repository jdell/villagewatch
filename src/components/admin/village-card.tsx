"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import {
  KeyRound,
  Loader2,
  MapPin,
  PauseCircle,
  PlayCircle,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import type { VillageStatus } from "@/generated/prisma/enums";
import {
  activateVillageAction,
  appointCoordinatorAction,
  reactivateVillageAction,
  regenerateJoinCodeAction,
  suspendVillageAction,
  type VillageAdminState,
} from "@/app/(app)/admin/villages/actions";
import { ControllerDuties } from "@/components/controller-duties";
import { VILLAGE_MODE_META, VILLAGE_STATUS_LABELS } from "@/lib/constants";

/**
 * One village, with the two or three things an administrator can do to it.
 *
 * The card changes shape with the status, because the decision is different.
 * A `PENDING` village has exactly one useful action — activate it — and showing
 * the coordinator field beside it would invite appointing somebody to a village
 * nobody can join yet. Once active, the join code and the appointment are what
 * matter and activation is gone.
 *
 * **Activation is where somebody becomes a data controller**, so the card says
 * what that means before the button rather than after it. A village is created
 * in the community model, which puts the duty on its coordinator; the
 * administrator pressing Activate is the last person in the chain who could
 * have mentioned it.
 *
 * **The join code is shown once, when it is minted.** It is never rendered from
 * the row: the page does not select the column, `rls_policies.sql` withholds it
 * from the anon grant, and it is not in the audit trail. An administrator who
 * loses it rotates it, which is one click and is the safer default anyway.
 */

export type AdminVillage = {
  id: string;
  name: string;
  slug: string;
  status: VillageStatus;
  region: string | null;
  /**
   * Whether a code exists — never the code itself. The distinction is the whole
   * point: an administrator needs to know a village is joinable, and does not
   * need the credential on screen to find that out.
   */
  hasJoinCode: boolean;
  residents: number;
  coordinators: number;
};

/**
 * Two-step, because one press should not take a village off the air.
 *
 * Suspension is reversible — the reactivate button is right there — so this is
 * deliberately *not* the merge screen's "type the village's name" ceremony,
 * which is what an operation with no undo earns. What it is is a beat: the
 * confirm panel names the village and says what stops and what does not, which
 * is the sentence an administrator needs in front of them rather than in a
 * changelog afterwards.
 */
function SuspendConfirm({
  villageName,
  residents,
  onCancel,
}: {
  villageName: string;
  residents: number;
  onCancel: () => void;
}) {
  const { pending } = useFormStatus();

  return (
    <div className="mt-3 rounded-xl bg-red-50 p-3.5 ring-1 ring-inset ring-red-600/20">
      <p className="text-xs font-semibold text-red-900">
        Suspend {villageName}?
      </p>
      <ul className="mt-1.5 space-y-1 text-xs leading-relaxed text-red-900">
        <li>
          It leaves the picker on the sign-up screens — nobody new can join, even
          with the join code.
        </li>
        <li>
          Its{" "}
          {residents === 1 ? "one resident" : `${residents} residents`} can still
          open the map and everything already on it, and cannot file anything new.
        </li>
        <li>
          Nothing is deleted. Reports, residents, coordinators and the audit trail
          are all untouched, and one button puts it back.
        </li>
      </ul>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <PauseCircle className="size-4" aria-hidden />
          )}
          Confirm suspension
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const IDLE: VillageAdminState = { ok: true, message: "" };

/**
 * The badge, and the one thing worth saying about it: **`SUSPENDED` no longer
 * looks like `ARCHIVED`.**
 *
 * The two shared one grey for as long as neither was reachable from a screen.
 * They are different facts now — suspended is a village somebody took out of
 * service this week and can put back with one button, archived is where a merge
 * left one and is not coming back — and telling them apart at a glance is the
 * whole job of a status badge on a list. Red rather than another amber, because
 * `PENDING` already owns amber here and "waiting to be set up" and "was running
 * and was stopped" are the pair most worth not confusing.
 */
const STATUS_CLASS: Record<VillageStatus, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-600/20",
  ACTIVE: "bg-safe-50 text-safe-700 ring-safe-600/20",
  SUSPENDED: "bg-red-50 text-red-700 ring-red-600/20",
  ARCHIVED: "bg-slate-100 text-slate-600 ring-slate-500/20",
};

function SubmitButton({
  children,
  icon: Icon,
  tone = "secondary",
}: {
  children: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className={
        tone === "primary"
          ? "inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
          : "inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
      }
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Icon className="size-4" aria-hidden />
      )}
      {children}
    </button>
  );
}

/**
 * The minted code, shown once.
 *
 * `role="status"` because it appears after a click with no other visual anchor,
 * and an administrator who does not notice it has to rotate the code to see one
 * again.
 */
function JoinCodePanel({ code }: { code: string }) {
  return (
    <div
      role="status"
      className="mt-3 rounded-xl bg-brand-50 p-3.5 ring-1 ring-inset ring-brand-200"
    >
      <p className="text-xs font-medium text-brand-900">
        Join code — copy it now, it is not shown again
      </p>
      <code className="mt-1.5 block font-mono text-lg font-semibold tracking-[0.2em] text-brand-900">
        {code}
      </code>
      <p className="mt-1.5 text-xs text-brand-800">
        Anyone who registers with this becomes a verified resident. Send it to
        the coordinator, not to a public channel.
      </p>
    </div>
  );
}

export function VillageCard({
  village,
  canSuspend = false,
}: {
  village: AdminVillage;
  /**
   * Whether the viewer is in `SUPER_ADMIN_EMAILS`.
   *
   * Computed on the server and passed in, for the reason `AppShellUser.isAdmin`
   * gives: this is a Client Component and the list is a server-only environment
   * variable with no `NEXT_PUBLIC_` prefix. **Hiding is all it is** — the two
   * actions re-check the grant, and `src/lib/villages.ts` checks it again beside
   * each write, because a server action is reachable without this card ever
   * having rendered.
   */
  canSuspend?: boolean;
}) {
  const [activateState, activate] = useActionState(activateVillageAction, IDLE);
  const [rotateState, rotate] = useActionState(regenerateJoinCodeAction, IDLE);
  const [appointState, appoint] = useActionState(appointCoordinatorAction, IDLE);
  const [suspendState, suspend] = useActionState(suspendVillageAction, IDLE);
  const [reactivateState, reactivate] = useActionState(
    reactivateVillageAction,
    IDLE,
  );
  const [email, setEmail] = useState("");
  const [confirmingSuspend, setConfirmingSuspend] = useState(false);
  const emailId = useId();

  useEffect(() => {
    for (const state of [
      activateState,
      rotateState,
      appointState,
      suspendState,
      reactivateState,
    ]) {
      if (!state.message) continue;
      if (state.ok) toast.success(state.message);
      else toast.error(state.message);
    }
  }, [activateState, rotateState, appointState, suspendState, reactivateState]);

  /*
    Close the confirm panel whenever the village's own status moves under it.

    Adjusting state during render rather than in an effect, which is React's
    documented shape for "reset some state when a prop changes" — the effect
    version is a cascading render and the lint rule says so. What it fixes is not
    only the obvious case: on a successful suspension `isActive` goes false and
    the panel is gone by construction anyway. It is the one after that. A card
    left with `confirmingSuspend` still true — a suspension that *failed*, and
    was then followed by somebody reactivating the village — would pop the
    confirm panel open on its own, with nobody having asked to suspend anything.

    A failure on its own deliberately leaves the panel up: the toast says what
    went wrong and the thing the administrator was trying to do is still in front
    of them.
  */
  const [statusAtRender, setStatusAtRender] = useState(village.status);

  if (statusAtRender !== village.status) {
    setStatusAtRender(village.status);
    setConfirmingSuspend(false);
  }

  // Whichever action last minted one. Only one can be non-empty per render:
  // activation mints on a PENDING village, rotation on an ACTIVE one, and
  // reactivation only on the village that had somehow lost its code.
  const mintedCode =
    activateState.joinCode ?? rotateState.joinCode ?? reactivateState.joinCode;
  const isActive = village.status === "ACTIVE";
  const isSuspended = village.status === "SUSPENDED";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <MapPin className="size-4 shrink-0 text-slate-400" aria-hidden />
            <span className="truncate">{village.name}</span>
          </h3>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {village.region ? `${village.region} · ` : ""}
            {village.slug}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${STATUS_CLASS[village.status]}`}
        >
          {VILLAGE_STATUS_LABELS[village.status]}
        </span>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
        <div className="flex gap-1.5">
          <dt className="text-slate-500">Residents</dt>
          <dd className="font-semibold tabular-nums">{village.residents}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-slate-500">Coordinators</dt>
          <dd className="font-semibold tabular-nums">{village.coordinators}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-slate-500">Join code</dt>
          <dd className="font-semibold">
            {village.hasJoinCode ? "set" : "none"}
          </dd>
        </div>
      </dl>

      {/*
        A village with nobody able to moderate it. Every report filed into it
        sits in PENDING_REVIEW unreachable (domain rule 6), which is the failure
        this whole screen exists to prevent — so it is called out rather than
        left to be inferred from a zero in the row above.
      */}
      {isActive && village.coordinators === 0 && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-inset ring-amber-600/20">
          Joinable, but nobody can moderate it. Every report filed here waits in
          a queue no one can open. Appoint a coordinator below.
        </p>
      )}

      {/*
        What activation actually hands somebody. A village is created in the
        community model (`DEFAULT_VILLAGE_MODE`), which makes its coordinator the
        data controller for every report filed in it — and an administrator
        pressing this button is the last person in the chain who could have said
        so before it happened. The duties are the ones with a deadline on them;
        the coordinator meets the same three again, in the second person, on
        their own compliance screen before they accept anything.
      */}
      {/*
        A suspended village is one somebody already took through this — its
        coordinator is already the data controller and already accepted the
        agreement — so the controller-duties panel is for the directory only.
        Showing it beside "Put back in service" would read as a fresh
        appointment of somebody who has been doing the job for months.
      */}
      {!isActive && !isSuspended && (
        <div className="mt-4 rounded-xl bg-brand-50/60 p-3.5 ring-1 ring-inset ring-brand-200">
          <h4 className="text-xs font-semibold text-slate-900">
            Activating makes its coordinator the data controller
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-slate-600">
            New villages run the <strong>community model</strong>:{" "}
            {VILLAGE_MODE_META.community.summary} The village accepts no report
            until that agreement is accepted on the coordinator&rsquo;s
            dashboard. A parish council can take the village on later, which
            switches it to the three-document model. What the coordinator is
            taking on:
          </p>
          <ControllerDuties size="sm" />
        </div>
      )}

      {/*
        What suspension actually did, on the card of a village in it. The badge
        says "Suspended" and this says what that means for the people in it —
        the question anybody looking at this row is about to ask.
      */}
      {isSuspended && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs leading-relaxed text-red-900 ring-1 ring-inset ring-red-600/20">
          Out of service. It is not in the sign-up pickers and no new report can
          be filed, and its residents see a banner saying so. Nothing has been
          deleted — every report, resident and audit row is untouched.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!isActive && !isSuspended && (
          <form action={activate}>
            <input type="hidden" name="villageId" value={village.id} />
            <SubmitButton icon={KeyRound} tone="primary">
              Activate and mint a join code
            </SubmitButton>
          </form>
        )}

        {isActive && (
          <form action={rotate}>
            <input type="hidden" name="villageId" value={village.id} />
            <SubmitButton icon={RefreshCw}>
              {village.hasJoinCode ? "New join code" : "Mint a join code"}
            </SubmitButton>
          </form>
        )}

        {/*
          Super-administrators only, and the button is absent rather than
          disabled for everyone else: a disabled control invites somebody to
          work out why, and the answer is an environment variable they cannot
          see. The merge screen takes the opposite line and explains itself
          instead — it is a whole page, and hiding the link would leave the one
          person who can set `SUPER_ADMIN_EMAILS` unable to find out it exists.
          A fourth button on a card is not that.
        */}
        {canSuspend && isSuspended && (
          <form action={reactivate}>
            <input type="hidden" name="villageId" value={village.id} />
            <SubmitButton icon={PlayCircle} tone="primary">
              Put back in service
            </SubmitButton>
          </form>
        )}

        {canSuspend && isActive && !confirmingSuspend && (
          <button
            type="button"
            onClick={() => setConfirmingSuspend(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-300 bg-white px-4 text-sm font-medium text-red-700 shadow-sm transition hover:bg-red-50"
          >
            <PauseCircle className="size-4" aria-hidden />
            Suspend
          </button>
        )}
      </div>

      {canSuspend && isActive && confirmingSuspend && (
        <form action={suspend}>
          <input type="hidden" name="villageId" value={village.id} />
          <SuspendConfirm
            villageName={village.name}
            residents={village.residents}
            onCancel={() => setConfirmingSuspend(false)}
          />
        </form>
      )}

      {mintedCode && <JoinCodePanel code={mintedCode} />}

      {isActive && (
        <form action={appoint} className="mt-4 border-t border-slate-200 pt-4">
          <input type="hidden" name="villageId" value={village.id} />
          <label
            htmlFor={`${emailId}-email`}
            className="block text-xs font-medium text-slate-700"
          >
            Appoint a coordinator
          </label>
          <p className="mt-0.5 text-xs text-slate-500">
            They have to have registered first — give them the join code, then
            put the address they signed up with here.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              id={`${emailId}-email`}
              name="email"
              type="email"
              autoComplete="off"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="them@example.com"
              className="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
            <SubmitButton icon={UserPlus}>Appoint</SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}
