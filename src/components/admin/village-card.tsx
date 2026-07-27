"use client";

import { useActionState, useEffect, useId, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { KeyRound, Loader2, MapPin, RefreshCw, UserPlus } from "lucide-react";
import type { VillageStatus } from "@/generated/prisma/enums";
import {
  activateVillageAction,
  appointCoordinatorAction,
  regenerateJoinCodeAction,
  type VillageAdminState,
} from "@/app/(app)/admin/villages/actions";
import { VILLAGE_STATUS_LABELS } from "@/lib/constants";

/**
 * One village, with the two or three things an administrator can do to it.
 *
 * The card changes shape with the status, because the decision is different.
 * A `PENDING` village has exactly one useful action — activate it — and showing
 * the coordinator field beside it would invite appointing somebody to a village
 * nobody can join yet. Once active, the join code and the appointment are what
 * matter and activation is gone.
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

const IDLE: VillageAdminState = { ok: true, message: "" };

const STATUS_CLASS: Record<VillageStatus, string> = {
  PENDING: "bg-amber-50 text-amber-800 ring-amber-600/20",
  ACTIVE: "bg-safe-50 text-safe-700 ring-safe-600/20",
  SUSPENDED: "bg-slate-100 text-slate-600 ring-slate-500/20",
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

export function VillageCard({ village }: { village: AdminVillage }) {
  const [activateState, activate] = useActionState(activateVillageAction, IDLE);
  const [rotateState, rotate] = useActionState(regenerateJoinCodeAction, IDLE);
  const [appointState, appoint] = useActionState(appointCoordinatorAction, IDLE);
  const [email, setEmail] = useState("");
  const emailId = useId();

  useEffect(() => {
    for (const state of [activateState, rotateState, appointState]) {
      if (!state.message) continue;
      if (state.ok) toast.success(state.message);
      else toast.error(state.message);
    }
  }, [activateState, rotateState, appointState]);

  // Whichever action last minted one. Only one can be non-empty per render:
  // activation mints on a PENDING village, rotation on an ACTIVE one.
  const mintedCode = activateState.joinCode ?? rotateState.joinCode;
  const isActive = village.status === "ACTIVE";

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

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {!isActive && (
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
      </div>

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
