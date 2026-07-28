"use server";

import { revalidatePath } from "next/cache";
import { requireCoordinator } from "@/lib/auth";
import { acceptCompliance, getVillageCompliance } from "@/lib/compliance";
import { complianceAcceptFormSchema } from "@/lib/validations";

/**
 * Accepting the DPIA, the Appropriate Policy Document and the data processing
 * agreement.
 *
 * The work is `acceptCompliance` in `src/lib/compliance.ts`; this is the
 * screen's half of it. Three things happen here and not there:
 *
 * 1. **`requireCoordinator()` is re-established from the server.** A server
 *    action is a POST endpoint with a generated URL and is reachable without the
 *    page ever rendering, so "the form is only on the compliance screen" is not
 *    an authorisation check.
 * 2. **The village comes from the session profile** (domain rule 4). The form
 *    posts three checkboxes and nothing else.
 * 3. **Every document still outstanding needs its box ticked**, and that rule
 *    lives here rather than in the schema so the message can name the one that
 *    is missing. It is checked against the village's recorded acceptances and
 *    not against the three names on their own: a document already accepted
 *    renders as a record rather than a checkbox, so it is *absent* from the
 *    payload by design, and requiring it unconditionally demanded a box that is
 *    not on the screen. The button is disabled until every outstanding box is
 *    ticked, so reaching this is either a direct POST or a browser with
 *    JavaScript off — and in both cases a sentence beats a validation error.
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
    dpa: formData.get("dpa") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, message: "That submission is not valid." };
  }

  const { dpia, apd, dpa } = parsed.data;

  // Which documents this village has still to accept. `acceptCompliance` reads
  // this again for its own reasons — it is the one that decides what to write,
  // and it must not take a caller's word for what is already recorded — so this
  // is a second read of three columns on one row, which is worth it to be able
  // to name the box that is actually missing.
  //
  // An unmigrated database reports all three as outstanding, which leaves that
  // path exactly as it was: all three boxes required, and `acceptCompliance`
  // returning the message that names the migrations once they are ticked.
  const current = await getVillageCompliance(villageId);

  const needsDpia = current.dpia === null && !dpia;
  const needsApd = current.apd === null && !apd;
  const needsDpa = current.dpa === null && !dpa;

  if (needsDpia || needsApd || needsDpa) {
    return {
      ok: false,
      message: needsDpia
        ? "Tick the box confirming you accept the DPIA."
        : needsApd
          ? "Tick the box confirming you accept the Appropriate Policy Document."
          : "Tick the box confirming you accept the Data Processing Agreement.",
    };
  }

  const result = await acceptCompliance({
    session,
    villageId,
    accept: { dpia, apd, dpa },
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
