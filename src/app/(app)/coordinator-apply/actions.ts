"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { submitCoordinatorRequest } from "@/lib/coordinator-requests";
import { coordinatorRequestSchema, fieldErrors } from "@/lib/validations";

/**
 * Filing a coordinator application.
 *
 * The action re-establishes the session server-side rather than trusting the
 * page that rendered the form: a server action is a POST endpoint with a
 * generated URL and is reachable without ever loading `/coordinator-apply`.
 * Everything else — that the applicant is a resident, that they have a village,
 * that they have no application already waiting — is checked in
 * `submitCoordinatorRequest()`, so the API route and this action refuse the
 * same things for the same reasons.
 */

export type CoordinatorApplyState = {
  ok: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

export async function applyForCoordinatorAction(
  _previous: CoordinatorApplyState,
  formData: FormData,
): Promise<CoordinatorApplyState> {
  const session = await requireSession("/coordinator-apply");

  const parsed = coordinatorRequestSchema.safeParse({
    role: formData.get("role"),
    // An untouched text input posts "", which is not the same as "omitted" to
    // an optional string — and the schema's "Something else needs detail" rule
    // has to see the difference.
    roleDetail: formData.get("roleDetail") || undefined,
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Check the highlighted fields.",
      fieldErrors: fieldErrors(parsed.error),
    };
  }

  const result = await submitCoordinatorRequest({
    session,
    values: parsed.data,
  });

  if (!result.ok) {
    return { ok: false, message: result.error };
  }

  // The settings screen renders the application's state, so it has to be
  // re-read rather than served from the router cache.
  revalidatePath("/settings");

  // Outside any try/catch: `redirect()` works by throwing, and swallowing that
  // would leave the form sitting on a submitted application.
  redirect("/settings?applied=1");
}
