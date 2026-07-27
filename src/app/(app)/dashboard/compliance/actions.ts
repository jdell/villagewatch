"use server";

import { revalidatePath } from "next/cache";
import { requireCoordinator } from "@/lib/auth";
import { acceptCompliance } from "@/lib/compliance";
import { complianceAcceptFormSchema } from "@/lib/validations";

/**
 * Accepting the DPIA and the Appropriate Policy Document.
 *
 * The work is `acceptCompliance` in `src/lib/compliance.ts`; this is the
 * screen's half of it. Three things happen here and not there:
 *
 * 1. **`requireCoordinator()` is re-established from the server.** A server
 *    action is a POST endpoint with a generated URL and is reachable without the
 *    page ever rendering, so "the form is only on the compliance screen" is not
 *    an authorisation check.
 * 2. **The village comes from the session profile** (domain rule 4). The form
 *    posts two checkboxes and nothing else.
 * 3. **Both boxes are required**, and that rule lives here rather than in the
 *    schema so the message can name the one that is missing. The button is
 *    disabled until both are ticked, so reaching this is either a direct POST or
 *    a browser with JavaScript off — and in both cases a sentence beats a
 *    validation error.
 */

export type ComplianceState = {
  ok: boolean;
  message: string;
  /** Set on success when both documents are now accepted. */
  complete?: boolean;
};

export async function acceptComplianceAction(
  _previous: ComplianceState,
  formData: FormData,
): Promise<ComplianceState> {
  const session = await requireCoordinator("/dashboard/compliance");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return { ok: false, message: "You are not attached to a village." };
  }

  const parsed = complianceAcceptFormSchema.safeParse({
    // An unchecked checkbox is absent from the payload entirely.
    dpia: formData.get("dpia") ?? "",
    apd: formData.get("apd") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, message: "That submission is not valid." };
  }

  const { dpia, apd } = parsed.data;

  if (!dpia || !apd) {
    return {
      ok: false,
      message: !dpia
        ? "Tick the box confirming you accept the DPIA."
        : "Tick the box confirming you accept the Appropriate Policy Document.",
    };
  }

  const result = await acceptCompliance({
    session,
    villageId,
    accept: { dpia, apd },
  });

  if (!result.ok) return { ok: false, message: result.error };

  // The banner on `/dashboard`, the wizard on `/incidents/new` and this page all
  // read the same two columns, so all three are stale the moment this returns.
  revalidatePath("/dashboard/compliance");
  revalidatePath("/dashboard");
  revalidatePath("/incidents/new");

  return {
    ok: true,
    complete: result.complete,
    message: result.complete
      ? "Recorded. Your village can now accept incident reports."
      : "Recorded.",
  };
}
