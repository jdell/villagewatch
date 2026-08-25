"use server";

import { revalidatePath } from "next/cache";
import { requireCoordinator } from "@/lib/auth";
import {
  acceptCompliance,
  getVillageCompliance,
  setVillageMode,
} from "@/lib/compliance";
// The labels come from the same list the page renders the documents from,
// rather than being restated here: a message naming a document the screen calls
// something else is a coordinator hunting for a checkbox that is not there.
import { COMPLIANCE_DOCUMENT_META } from "@/lib/compliance-documents";
import { documentsForMode } from "@/lib/constants";
import {
  complianceAcceptFormSchema,
  villageModeFormSchema,
} from "@/lib/validations";

/**
 * Accepting whichever documents this village's compliance model asks for — the
 * council's three, or the community village's one.
 *
 * The work is `acceptCompliance` in `src/lib/compliance.ts`; this is the
 * screen's half of it. Three things happen here and not there:
 *
 * 1. **`requireCoordinator()` is re-established from the server.** A server
 *    action is a POST endpoint with a generated URL and is reachable without the
 *    page ever rendering, so "the form is only on the compliance screen" is not
 *    an authorisation check.
 * 2. **The village comes from the session profile** (domain rule 4). The form
 *    posts checkboxes and nothing else — never a village id, and never the mode.
 * 3. **Every document still outstanding needs its box ticked**, and that rule
 *    lives here rather than in the schema so the message can name the one that
 *    is missing. It is checked against the village's recorded acceptances and
 *    against its **mode**, not against the four names on their own: a document
 *    already accepted renders as a record rather than a checkbox, so it is
 *    *absent* from the payload by design, and a document the village's model
 *    does not ask for is never rendered at all. The button is disabled until
 *    every outstanding box is ticked, so reaching this is either a direct POST
 *    or a browser with JavaScript off — and in both cases a sentence beats a
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
    dpa: formData.get("dpa") ?? "",
    community: formData.get("community") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, message: "That submission is not valid." };
  }

  const accept = parsed.data;

  // What this village has already accepted, and which model it is on.
  // `acceptCompliance` reads the same row again for its own reasons — it is the
  // one that decides what to write, and it must not take a caller's word for
  // what is already recorded — so this is a second read of one row, which is
  // worth it to be able to name the box that is actually missing.
  //
  // An unmigrated database reports the community model with nothing accepted,
  // so the one box is required and `acceptCompliance` returns the message that
  // names the migrations once it is ticked.
  const current = await getVillageCompliance(villageId);

  // Outstanding for *this* village: asked for by its model, not already
  // recorded, and not ticked. Derived from one list rather than a chain of
  // three conditions, so adding a document or a mode cannot leave a box
  // unchecked here while the screen renders it.
  const outstanding = documentsForMode(current.mode).filter((id) => {
    if (id === "dpia") return current.dpia === null && !accept.dpia;
    if (id === "apd") return current.apd === null && !accept.apd;
    if (id === "dpa") return current.dpa === null && !accept.dpa;
    return current.communityDpa === null && !accept.community;
  });

  if (outstanding.length > 0) {
    return {
      ok: false,
      message: `Tick the box confirming you accept the ${COMPLIANCE_DOCUMENT_META[outstanding[0]].label}.`,
    };
  }

  const result = await acceptCompliance({ session, villageId, accept });

  if (!result.ok) return { ok: false, message: result.error };

  // The banner on `/dashboard`, the wizard on `/incidents/new` and this page all
  // read the same two columns, so all three are stale the moment this returns.
  revalidatePath("/dashboard/compliance");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  revalidatePath("/incidents/new");

  return {
    ok: true,
    complete: result.complete,
    message: result.complete
      ? "Recorded. Your village can now accept incident reports."
      : "Recorded.",
  };
}

export type ModeState = {
  ok: boolean;
  message: string;
};

/**
 * Moving the village to the parish council model.
 *
 * The work is `setVillageMode`; this is the screen's half, and it is the same
 * three things the acceptance action does — the coordinator gate re-established
 * server-side, the village taken from the session profile, and the payload
 * carrying nothing but the choice.
 *
 * **The village does not go offline when this succeeds.** The council's three
 * documents are outstanding from that moment, but the coordinator's agreement is
 * still what authorises the processing until the council has adopted its own —
 * see `isComplete` in `src/lib/compliance.ts`. The success message says which
 * documents are now owed rather than implying the screen is finished.
 */
export async function setVillageModeAction(
  _previous: ModeState,
  formData: FormData,
): Promise<ModeState> {
  const session = await requireCoordinator("/dashboard/compliance");
  const villageId = session.profile?.villageId;

  if (!villageId || !process.env.DATABASE_URL) {
    return { ok: false, message: "You are not attached to a village." };
  }

  const parsed = villageModeFormSchema.safeParse({
    mode: formData.get("mode") ?? "",
  });

  if (!parsed.success) {
    return { ok: false, message: "Choose a compliance model." };
  }

  const result = await setVillageMode({
    session,
    villageId,
    mode: parsed.data.mode,
  });

  if (!result.ok) return { ok: false, message: result.error };

  revalidatePath("/dashboard/compliance");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");
  revalidatePath("/incidents/new");

  return {
    ok: true,
    message:
      "This village now runs the parish council model. The council has three " +
      "documents to adopt; reporting stays open on your own agreement until it " +
      "does.",
  };
}
