"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import {
  BadgeCheck,
  Eye,
  EyeOff,
  Loader2,
  UserRound,
  Users,
} from "lucide-react";
import type { UserRole } from "@/generated/prisma/enums";
import {
  revealResidentEmailAction,
  saveResidentRoleAction,
  type ResidentRoleState,
} from "@/app/(app)/dashboard/actions";
import { USER_ROLE_LABELS, isCoordinatorRole } from "@/lib/constants";
import { formatDate, initialsOf } from "@/lib/format";

/**
 * Who is in the village, and the one change a coordinator may make to it.
 *
 * This closes the standing gap in "Not built yet": there was no way to promote
 * anybody to `VERIFIED_RESIDENT`, so the only path to that column being filled
 * was a side effect of approving a coordinator application — a different
 * decision entirely.
 *
 * **The only thing this control writes is a verification.** `RESIDENT` ↔
 * `VERIFIED_RESIDENT` and nothing else; there is no promote-to-coordinator
 * button here and there deliberately cannot be one. Raising somebody into
 * `COORDINATOR` is `appointCoordinator` or an approved application, both
 * platform-admin only, and a coordinator who could mint coordinators would make
 * that review decorative. The refusals are enforced in `setResidentRole` — the
 * absent button is not an authorisation check, the same way an absent sidebar
 * link never was.
 *
 * The row for somebody who cannot be changed says why rather than rendering a
 * disabled button with no explanation: a coordinator looking for the control on
 * their own row, or on a fellow coordinator's, is owed the sentence.
 */

export type ResidentRow = {
  id: string;
  fullName: string;
  /**
   * `j***@gmail.com`, masked on the server by `listVillageResidents`.
   *
   * The full address is deliberately **not** on this type. It arrives one at a
   * time from `revealResidentEmailAction` when a coordinator presses Show — so
   * a page of fifty residents carries fifty masks and no addresses, and a
   * screenshot of this screen is not a screenshot of the village's contact
   * list. See `getResidentEmail` for what that does and does not buy.
   */
  maskedEmail: string;
  role: UserRole;
  /** ISO string — `Date` does not survive the server/client boundary intact. */
  verifiedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  publishedReports: number;
};

const IDLE: ResidentRoleState = { ok: true, message: "" };

function RoleButton({ verified }: { verified: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      name="verified"
      // The intent, not a role. `setResidentRole` picks the role.
      value={verified ? "on" : ""}
      disabled={pending}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold shadow-sm transition disabled:opacity-60 ${
        verified
          ? "bg-brand-600 text-white hover:bg-brand-700"
          : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      }`}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : (
        <BadgeCheck className="size-3.5" aria-hidden />
      )}
      {verified ? "Verify" : "Withdraw"}
    </button>
  );
}

/**
 * One resident's email address: masked, and revealed on request.
 *
 * A child component with its own `useActionState` rather than one hook at list
 * level, because the state here is genuinely per row — a coordinator revealing
 * one address should not put the others into a pending state, and a single hook
 * would hold one result that every row would then have to filter by id. Same
 * reasoning as `ModerationCard` owning its own reveal.
 *
 * The revealed address is component state and nothing more: navigating away or
 * refreshing puts the mask back, which is what makes Hide a real control rather
 * than a decoration. Nothing is persisted, and there is nothing to persist —
 * the address is a round trip away whenever it is wanted again.
 */
function ResidentEmail({
  residentId,
  fullName,
  maskedEmail,
}: {
  residentId: string;
  /** For the button's accessible name — "Show" alone names nobody. */
  fullName: string;
  maskedEmail: string;
}) {
  const [state, reveal, revealing] = useActionState(revealResidentEmailAction, {
    email: null,
    error: null,
  });
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state.error]);

  // Revealed once and not since hidden again. Hiding keeps the fetched address
  // in state rather than discarding it — pressing Show again should not cost a
  // second round trip for something this browser has already been told.
  const revealed = state.email;
  const shown = revealed !== null && !hidden;

  /*
    A `div`, not the `p` this replaced. It contains a `<form>`, which is flow
    content — a paragraph may hold only phrasing content, so the HTML parser
    would close the `p` at the `form` and rebuild a tree React did not render.
    That is a hydration mismatch, and it is one that only shows up in the
    server-rendered pass.
  */
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500">
      <span className="min-w-0 truncate" title={shown ? revealed : undefined}>
        {shown ? revealed : maskedEmail}
      </span>

      {revealed === null ? (
        <form action={reveal} className="contents">
          <input type="hidden" name="residentId" value={residentId} />
          <button
            type="submit"
            disabled={revealing}
            className="inline-flex shrink-0 items-center gap-1 rounded font-medium text-brand-700 transition hover:text-brand-800 disabled:opacity-60"
          >
            {revealing ? (
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
            ) : (
              <Eye className="size-3.5" aria-hidden />
            )}
            <span aria-hidden>Show</span>
            <span className="sr-only">
              Show {fullName}&rsquo;s full email address
            </span>
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setHidden((current) => !current)}
          className="inline-flex shrink-0 items-center gap-1 rounded font-medium text-slate-500 transition hover:text-slate-700"
        >
          {shown ? (
            <EyeOff className="size-3.5" aria-hidden />
          ) : (
            <Eye className="size-3.5" aria-hidden />
          )}
          <span aria-hidden>{shown ? "Hide" : "Show"}</span>
          <span className="sr-only">
            {shown ? "Hide" : "Show"} {fullName}&rsquo;s full email address
          </span>
        </button>
      )}
    </div>
  );
}

export function ResidentList({
  residents,
  total,
  currentUserId,
}: {
  residents: readonly ResidentRow[];
  /** Every account in the village, so the list can say what it is not showing. */
  total: number;
  /** The signed-in coordinator, so their own row explains itself. */
  currentUserId: string;
}) {
  const [state, save] = useActionState(saveResidentRoleAction, IDLE);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Users className="size-4 text-slate-400" aria-hidden />
        Residents
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Everyone who has joined your village. Verifying somebody records that you
        know they live here — it does not change what they can see.
      </p>

      {residents.length === 0 ? (
        <p className="mt-4 rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-500 ring-1 ring-inset ring-slate-200">
          Nobody has joined yet. Share the invite above.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100">
          {residents.map((resident) => {
            const self = resident.id === currentUserId;
            const closed = Boolean(resident.deletedAt);
            const senior = isCoordinatorRole(resident.role);
            const verified = Boolean(resident.verifiedAt);
            // Mirrors `setResidentRole`'s refusals. The server is what
            // enforces them; this decides what to draw.
            const changeable = !self && !closed && !senior;

            return (
              <li
                key={resident.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    closed
                      ? "bg-slate-100 text-slate-400"
                      : "bg-brand-50 text-brand-700"
                  }`}
                  aria-hidden
                >
                  {initialsOf(resident.fullName)}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium text-slate-900">
                    {resident.fullName}
                    {verified && !closed && (
                      <BadgeCheck
                        className="size-4 shrink-0 text-brand-600"
                        aria-label="Verified resident"
                      />
                    )}
                  </p>
                  <ResidentEmail
                    residentId={resident.id}
                    fullName={resident.fullName}
                    maskedEmail={resident.maskedEmail}
                  />
                  <p className="mt-0.5 text-xs text-slate-400">
                    {USER_ROLE_LABELS[resident.role]} · joined{" "}
                    {formatDate(resident.createdAt)}
                    {resident.publishedReports > 0 && (
                      <>
                        {" · "}
                        {resident.publishedReports} report
                        {resident.publishedReports === 1 ? "" : "s"}
                      </>
                    )}
                  </p>
                </div>

                {closed ? (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 ring-1 ring-inset ring-slate-300">
                    Account closed
                  </span>
                ) : changeable ? (
                  <form action={save} className="shrink-0">
                    <input
                      type="hidden"
                      name="residentId"
                      value={resident.id}
                    />
                    <RoleButton verified={!verified} />
                  </form>
                ) : (
                  <span className="shrink-0 text-xs text-slate-400">
                    {self
                      ? "This is you"
                      : /*
                          A coordinator, a moderator or an administrator. The
                          route that granted the access is the route that takes
                          it away — two coordinators who fell out must not be
                          able to remove each other.
                        */
                        "Managed by a platform administrator"}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {total > residents.length && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
          <UserRound className="size-3.5 shrink-0" aria-hidden />
          Showing {residents.length} of {total}.
        </p>
      )}
    </section>
  );
}
