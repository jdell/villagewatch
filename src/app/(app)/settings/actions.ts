"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { eraseAccount } from "@/lib/erasure";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { fieldErrors, settingsFormSchema } from "@/lib/validations";

/**
 * Saving the settings form.
 *
 * The fields a resident may change are exactly the fields listed in
 * `settingsFormSchema` — their name, their street or area, and how they want to
 * be told about things. **`role`, `verifiedAt` and `villageId` are not among
 * them** (domain rule 5): those are set by server code from a verified join
 * code or a coordinator action, and a form post that named them would otherwise
 * be a self-service promotion to coordinator.
 *
 * The update is keyed on the session user id, never on anything in the form.
 */

export type SettingsState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

export async function saveSettingsAction(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await requireSession("/settings");

  if (!process.env.DATABASE_URL) {
    return { ok: false, message: "The database is not configured." };
  }

  const parsed = settingsFormSchema.safeParse({
    fullName: formData.get("fullName"),
    addressLine: formData.get("addressLine") || undefined,
    // An unchecked checkbox is absent from the payload entirely, which is why
    // the schema treats "missing" as false rather than as "leave unchanged".
    notifyPush: formData.get("notifyPush") ?? "",
    notifyMinSeverity: formData.get("notifyMinSeverity"),
    notifyRadiusMeters: formData.get("notifyRadiusMeters") ?? "",
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  const values = parsed.data;

  try {
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        fullName: values.fullName,
        addressLine: values.addressLine ?? null,
        notifyPush: values.notifyPush,
        notifyMinSeverity: values.notifyMinSeverity,
        notifyRadiusMeters: values.notifyRadiusMeters,
      },
    });
  } catch (cause) {
    console.error("Could not save settings for %s", session.user.id, cause);
    return { ok: false, message: "Could not save your settings. Try again." };
  }

  // The sidebar renders the display name from the same row.
  revalidatePath("/settings");
  revalidatePath("/", "layout");

  return { ok: true, message: "Settings saved." };
}

/**
 * Closing your own account — UK GDPR Article 17.
 *
 * The erasure itself is `eraseAccount` in `src/lib/erasure.ts`; this is the
 * screen's half of it, and there are three things it does that the library
 * deliberately does not:
 *
 * 1. **It requires the resident to type their own email.** Not a checkbox and
 *    not a second click — this is the only irreversible action a resident can
 *    take on their own data, and it should cost the same deliberate effort that
 *    GitHub and Stripe ask for. The comparison is case-insensitive and trimmed,
 *    because the point is intent, not typing accuracy.
 * 2. **It signs them out.** Leaving the cookies in place would put a closed
 *    account back on `/map`, where `(app)/layout.tsx` would bounce it to
 *    `/account-closed` anyway — a redirect explaining a state the browser is
 *    still authenticated for. Clearing the session is the honest end.
 * 3. **It redirects to a public page.** `/account-closed` sits outside the
 *    `(app)` group, so it renders with no session and no sidebar.
 *
 * A server action can clear the Supabase cookies, unlike a Server Component:
 * `createClient()`'s `setAll` has a writable cookie store here, the same as in a
 * Route Handler. So this does not need to bounce through `/api/auth/logout`.
 */
export async function deleteAccountAction(
  _previous: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const session = await requireSession("/settings");

  const typed = String(formData.get("confirmEmail") ?? "")
    .trim()
    .toLowerCase();
  const expected = (session.user.email ?? "").trim().toLowerCase();

  if (!expected || typed !== expected) {
    return {
      ok: false,
      message: "Type your email address exactly to confirm.",
      fieldErrors: { confirmEmail: "That does not match your email address." },
    };
  }

  const result = await eraseAccount({ session });

  if (!result.ok) return { ok: false, message: result.error };

  if (result.mediaSkipped) {
    // The account is closed and the reports are off every screen; the files are
    // still in the bucket. Not something the resident can act on, and not
    // something to hide from the logs either.
    console.warn(
      "Account closure for %s left media in place: %s",
      session.user.id,
      result.mediaSkipped,
    );
  }

  if (isSupabaseConfigured) {
    try {
      const supabase = await createClient();
      await supabase.auth.signOut();
    } catch (cause) {
      // Not worth failing on, and it must not be: the account is already
      // closed, both sign-in gates now refuse it, and `(app)/layout.tsx`
      // redirects the session that is still open — to exactly where the
      // redirect below is sending them anyway. Throwing here would show
      // "something went wrong" over a closure that completed.
      console.error(
        "Could not sign out closed account %s",
        session.user.id,
        cause,
      );
    }
  }

  // The sidebar renders the display name and the admin flag off the profile.
  revalidatePath("/", "layout");

  // Outside the try above, because `redirect()` works by throwing.
  redirect("/account-closed");
}
