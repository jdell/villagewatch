"use client";

import { useFormStatus } from "react-dom";
import { setUiVersionOverrideAction } from "@/app/(app)/ui-version-actions";
import { otherUiVersion } from "@/lib/ui-version";
import { useUiVersion } from "@/components/ui-version-context";

/**
 * "Try the new look" / "Switch to classic view" — one resident's override of
 * their village's interface, for this browser session.
 *
 * A form rather than a link, because it changes state (a cookie) and a GET that
 * did so could be triggered by a prefetch or an `<img>` on another page.
 * `setUiVersionOverrideAction` validates the value and clears the cookie when
 * the choice matches the village's own.
 */

function SwitchButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="text-xs font-medium text-brand-200 underline underline-offset-2 transition hover:text-white disabled:opacity-60"
    >
      {label}
    </button>
  );
}

export function UiVersionSwitch() {
  const { effective } = useUiVersion();
  const target = otherUiVersion(effective);

  return (
    <form action={setUiVersionOverrideAction} className="mt-3 px-3">
      <input type="hidden" name="uiVersion" value={target} />
      <SwitchButton
        label={target === "modern" ? "Try the new look" : "Switch to classic view"}
      />
    </form>
  );
}
