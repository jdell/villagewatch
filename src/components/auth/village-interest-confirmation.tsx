"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

/**
 * What replaces the form once an interest row has been written.
 *
 * It takes the place of the form rather than appearing above it, because the
 * form is finished: there is no account to go and confirm, no email link to
 * click, and nothing to correct. Leaving the fields on screen would invite a
 * second submission of the same thing, which is two rows and two emails.
 *
 * ## It says the village's name back
 *
 * "We'll be in touch when Cottenham is ready" is the wireframe's wording and it
 * is worth keeping literally. It is the one thing on this screen that proves
 * the right thing was recorded — somebody who mistyped their village finds out
 * here rather than by never hearing anything.
 *
 * The name is echoed from the **server's** response rather than from the form
 * state, so it is what was actually stored after trimming. A screen confirming
 * what the browser had rather than what the row holds is a screen that can lie
 * in exactly the case that matters.
 *
 * ## No route change
 *
 * This is state on `/register` rather than a redirect to a success page.
 * `/register?registered=1` would be a URL somebody can bookmark, share or
 * refresh into, all of which produce a confirmation for something that did not
 * happen — and the flash-toast-before-a-redirect pattern is the one
 * `fix/auth-verification-messages` had to take *out* of this very form.
 */
export function VillageInterestConfirmation({
  villageName,
  isCoordinatorCandidate,
}: {
  villageName: string;
  isCoordinatorCandidate: boolean;
}) {
  return (
    <div role="status" className="text-center">
      <CheckCircle2
        className="mx-auto size-10 text-brand-600"
        aria-hidden
      />

      <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-900">
        Thanks! We&rsquo;ll be in touch when {villageName} is ready.
      </h2>

      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {isCoordinatorCandidate ? (
          <>
            We&rsquo;ll also reach out about the coordinator role — that&rsquo;s
            the part that gets a village started, and there&rsquo;s no
            commitment in having said yes.
          </>
        ) : (
          <>
            We&rsquo;ve sent a confirmation to the address you gave us. Most
            villages start when somebody there volunteers to coordinate.
          </>
        )}
      </p>

      {/*
        The removal route, on screen as well as in the email.

        Everybody else in this application can delete their own data from
        `/settings`; this person has no account and therefore no screen to do it
        from. An email address is the only route they have, so it is not left
        solely in a message that might go to spam.
      */}
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        We keep your details until {villageName} launches or you ask us to
        remove them. To be removed, reply to that email or see the{" "}
        <Link
          href="/privacy"
          className="font-medium text-brand-600 underline underline-offset-2 hover:text-brand-700"
        >
          privacy notice
        </Link>
        .
      </p>

      <p className="mt-6 text-sm text-slate-600">
        {APP_NAME} is not an emergency service. If something is happening now
        and somebody is in danger, call 999.
      </p>
    </div>
  );
}
