"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";
import { toast } from "sonner";
import { Landmark, Loader2 } from "lucide-react";
import {
  saveVillagePostcodeAction,
  type VillagePostcodeState,
} from "@/app/(app)/dashboard/actions";
import { VILLAGE_POSTCODE_MAX_CHARS } from "@/lib/validations";

/**
 * The village's postcode — the one thing "Write to your MP" needs and no
 * village had, because the ONS directory the villages were seeded from carries
 * none.
 *
 * The hint asks for a public place rather than anybody's home. The postcode is
 * sent to Parliament's API, kept against the village and recorded in the audit
 * trail, and a coordinator's own postcode is the obvious thing to type and the
 * wrong one to have in any of those three places. Any postcode in the
 * constituency finds the same MP.
 *
 * Shaped like `EcopsSiteForm`: one field, empty clears it, and Save is live
 * only when the field differs from what is stored.
 */

const IDLE: VillagePostcodeState = { ok: true, message: "" };

function SaveButton({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || !dirty}
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
    >
      {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
      Save postcode
    </button>
  );
}

export function VillagePostcodeForm({ value }: { value: string | null }) {
  const [state, save] = useActionState(saveVillagePostcodeAction, IDLE);
  const [postcode, setPostcode] = useState(value ?? "");

  useEffect(() => {
    if (!state.message) return;
    if (state.ok) toast.success(state.message);
    else if (!state.fieldErrors?.postcode) toast.error(state.message);
  }, [state]);

  // Compared without case or spaces, the way the schema normalises: typing
  // `cb24 9ab` over a stored `CB24 9AB` is not a change worth a Save.
  const compact = (text: string) => text.replace(/\s+/g, "").toUpperCase();
  const dirty = compact(postcode) !== compact(value ?? "");
  const error = state.fieldErrors?.postcode;

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Landmark className="size-4 text-slate-400" aria-hidden />
        Village postcode
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        Used to find your village&rsquo;s MP for &ldquo;Write to your MP&rdquo;
        on the Reports page. Nothing else uses it.
      </p>

      <form action={save} className="mt-4 space-y-4">
        <div>
          <label
            htmlFor="village-postcode"
            className="block text-sm font-medium text-slate-700"
          >
            Postcode
          </label>
          <input
            id="village-postcode"
            name="postcode"
            type="text"
            value={postcode}
            onChange={(event) => setPostcode(event.target.value)}
            maxLength={VILLAGE_POSTCODE_MAX_CHARS}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-invalid={Boolean(error)}
            aria-describedby={
              error
                ? "village-postcode-error village-postcode-hint"
                : "village-postcode-hint"
            }
            className="mt-1.5 block w-full max-w-40 rounded-lg border border-slate-300 px-3.5 py-2.5 uppercase text-slate-900 shadow-sm outline-none transition placeholder:normal-case placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-red-400"
            placeholder="e.g. CB24 9AB"
          />
          {error && (
            <p id="village-postcode-error" className="mt-1.5 text-sm text-red-600">
              {error}
            </p>
          )}
          <p id="village-postcode-hint" className="mt-1.5 text-xs text-slate-500">
            Use a public place in the village — the village hall, the church or
            the shop — not your own home. Any postcode in the constituency
            finds the same MP. Leave it empty to remove it.
          </p>
        </div>

        <SaveButton dirty={dirty} />
      </form>
    </section>
  );
}
