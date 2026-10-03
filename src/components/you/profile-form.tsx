"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CARD_SHADOW } from "@/components/you/settings-list";
import { saveProfileAction, type SettingsState } from "@/app/(app)/settings/actions";

/**
 * Your name and your street or area — the Profile sub-page of "You".
 *
 * Email is shown and not editable: it is the sign-in address and changing it is
 * a Supabase Auth flow with a confirmation email, not a column update. Role and
 * village are not here at all (domain rule 5).
 */

const IDLE: SettingsState = { ok: true, message: "" };

const FIELD =
  "block w-full rounded-xl border border-[#e2e8f0] bg-white px-3.5 py-3 text-[15px] text-[#0f172a] outline-none transition focus:border-[#0284c7] focus:ring-2 focus:ring-[#0284c7]/20 aria-invalid:border-red-400";

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-[#0284c7] text-[15px] font-semibold text-white transition hover:bg-[#0369a1] disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Save
    </button>
  );
}

export function ProfileForm({
  fullName,
  addressLine,
  email,
}: {
  fullName: string;
  addressLine: string;
  email: string;
}) {
  const [state, save] = useActionState(saveProfileAction, IDLE);

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else toast.error(state.message);
  }, [state]);

  const errors = state.fieldErrors ?? {};

  return (
    <form action={save} className="flex flex-col gap-4">
      <div className={`flex flex-col gap-4 rounded-[18px] bg-white p-4 ${CARD_SHADOW}`}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fullName" className="text-[13.5px] font-semibold text-[#334155]">
            Name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            required
            maxLength={80}
            defaultValue={fullName}
            autoComplete="name"
            aria-invalid={Boolean(errors.fullName)}
            aria-describedby={errors.fullName ? "fullName-error" : "fullName-hint"}
            className={FIELD}
          />
          <p id="fullName-hint" className="text-[12.5px] text-[#64748b]">
            Your coordinator sees it on reports you file. Your neighbours never do.
          </p>
          {errors.fullName && (
            <p id="fullName-error" role="alert" className="text-[13px] text-red-600">
              {errors.fullName}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="addressLine" className="text-[13.5px] font-semibold text-[#334155]">
            Street or area
          </label>
          <input
            id="addressLine"
            name="addressLine"
            type="text"
            maxLength={160}
            defaultValue={addressLine}
            placeholder="e.g. the top end of Oak Lane"
            aria-invalid={Boolean(errors.addressLine)}
            aria-describedby={errors.addressLine ? "addressLine-error" : "addressLine-hint"}
            className={FIELD}
          />
          <p id="addressLine-hint" className="text-[12.5px] text-[#64748b]">
            Only your coordinator sees this, and only to verify you live in the
            village. It is never shown to other residents or attached to a report.
          </p>
          {errors.addressLine && (
            <p id="addressLine-error" role="alert" className="text-[13px] text-red-600">
              {errors.addressLine}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[13.5px] font-semibold text-[#334155]">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            readOnly
            aria-describedby="email-hint"
            className={`${FIELD} cursor-not-allowed bg-[#f8fafc] text-[#64748b]`}
          />
          <p id="email-hint" className="text-[12.5px] text-[#64748b]">
            Your sign-in address. Ask your coordinator if it needs to change.
          </p>
        </div>
      </div>

      <Save />
    </form>
  );
}
