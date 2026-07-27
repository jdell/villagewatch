"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { decideCoordinatorRequest } from "@/lib/coordinator-requests";
import { coordinatorRequestDecisionSchema } from "@/lib/validations";

/**
 * The two decisions on the coordinator request queue.
 *
 * `requireAdmin()` re-establishes the role from the server on every call. A
 * server action is a POST endpoint with a generated URL — reachable without
 * ever rendering `/admin/coordinators` — so "the button is only on an admin
 * page" is not an authorisation check. This is, and
 * `decideCoordinatorRequest()` checks it a second time next to the write it
 * guards.
 */

export type CoordinatorDecisionState = {
  ok: boolean;
  message: string;
};

const decisionFormSchema = z.object({ requestId: z.uuid() });

export async function decideCoordinatorRequestAction(
  _previous: CoordinatorDecisionState,
  formData: FormData,
): Promise<CoordinatorDecisionState> {
  const session = await requireAdmin("/admin/coordinators");

  const identity = decisionFormSchema.safeParse({
    requestId: formData.get("requestId"),
  });

  const decision = coordinatorRequestDecisionSchema.safeParse({
    decision: formData.get("decision"),
    note: formData.get("note") || undefined,
  });

  if (!identity.success) {
    return { ok: false, message: "That application could not be found." };
  }

  if (!decision.success) {
    // The only rule a well-formed click can break is the required rejection
    // note, so say that rather than "invalid input".
    return {
      ok: false,
      message:
        decision.error.issues[0]?.message ?? "That decision is not valid.",
    };
  }

  const result = await decideCoordinatorRequest({
    session,
    requestId: identity.data.requestId,
    decision: decision.data.decision,
    note: decision.data.note,
  });

  if (!result.ok) return { ok: false, message: result.error };

  // Both tabs change: the application leaves the queue and joins the history.
  revalidatePath("/admin/coordinators");

  return {
    ok: true,
    message:
      result.status === "APPROVED"
        ? `${result.applicantName} now coordinates ${result.villageName}.`
        : `${result.applicantName}'s application was declined.`,
  };
}
