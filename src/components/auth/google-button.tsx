"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * "Continue with Google", shared by the sign-in and registration screens.
 *
 * There is one button for both because OAuth does not distinguish them: Google
 * returns the same identity either way, and whether this is a new resident or a
 * returning one is a question about our own database, answered by
 * `/api/auth/callback` once the session exists.
 *
 * `signInWithOAuth` is called from the browser client on purpose. It starts the
 * PKCE flow, which stores a verifier the callback needs; running it server-side
 * would leave that verifier on the wrong machine.
 */

/**
 * lucide-react has no Google mark — it ships one icon style and a brand logo is
 * not it. Inline rather than a dependency, and in Google's own colours because
 * their branding terms require the mark not be recoloured.
 */
function GoogleMark() {
  return (
    <svg className="size-4" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

type GoogleButtonProps = {
  /**
   * Where to land after the round trip. Carried through the provider and back,
   * and re-validated as a relative path in the callback — by the time it
   * returns it has been outside our control.
   */
  next?: string;
  label?: string;
};

export function GoogleButton({
  next,
  label = "Continue with Google",
}: GoogleButtonProps) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const supabase = createClient();
      const callback = new URL("/api/auth/callback", window.location.origin);
      if (next) callback.searchParams.set("next", next);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: callback.toString() },
      });

      if (error) {
        toast.error("Could not reach Google — try again, or use your password");
        setPending(false);
      }
      // On success the browser is already navigating away. Deliberately leave
      // `pending` set: clearing it would flash an enabled button over the top
      // of a redirect in progress.
    } catch {
      toast.error("Network error — check your connection and try again");
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <GoogleMark />
      )}
      {pending ? "Taking you to Google…" : label}
    </button>
  );
}

/** "or" rule between the provider button and the email form. */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-slate-200" />
      <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
        or
      </span>
      <span className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
