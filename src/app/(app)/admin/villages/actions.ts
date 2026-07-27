"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  activateVillage,
  appointCoordinator,
  regenerateJoinCode,
} from "@/lib/villages";
import { villageActionSchema, villageAppointSchema } from "@/lib/validations";

/**
 * Server actions behind `/admin/villages`.
 *
 * Each re-establishes the session and the administrator check from the server.
 * A server action is a POST endpoint with a generated URL — it is reachable
 * without ever rendering the page, so "the button is only on the admin screen"
 * is not an authorisation check. `requireAdmin()` is, and `src/lib/villages.ts`
 * checks again next to the privilege itself.
 *
 * Unlike every other action in the app these take a `villageId` from the form.
 * That is correct here and only here — see `villageActionSchema` for why.
 */

export type VillageAdminState = {
  ok: boolean;
  message: string;
  /**
   * The freshly minted code, when this action minted one. Rendered once, on the
   * screen that asked for it, and deliberately not stored anywhere else: it is
   * a credential, and it is never written to the audit trail.
   */
  joinCode?: string;
};

/** Revalidates every surface a village's status or code can be seen through. */
function revalidateVillageSurfaces() {
  revalidatePath("/admin/villages");
  // The pickers on both auth screens are filtered to ACTIVE, so a newly
  // activated village does not appear in them until these are rebuilt.
  revalidatePath("/register");
  revalidatePath("/welcome");
}

export async function activateVillageAction(
  _previous: VillageAdminState,
  formData: FormData,
): Promise<VillageAdminState> {
  const session = await requireAdmin("/admin/villages");

  const parsed = villageActionSchema.safeParse({
    villageId: formData.get("villageId"),
  });

  if (!parsed.success) {
    return { ok: false, message: "That village is not valid." };
  }

  const result = await activateVillage({
    session,
    villageId: parsed.data.villageId,
  });

  if (!result.ok) return { ok: false, message: result.error };

  revalidateVillageSurfaces();

  return { ok: true, message: result.message, joinCode: result.joinCode };
}

export async function regenerateJoinCodeAction(
  _previous: VillageAdminState,
  formData: FormData,
): Promise<VillageAdminState> {
  const session = await requireAdmin("/admin/villages");

  const parsed = villageActionSchema.safeParse({
    villageId: formData.get("villageId"),
  });

  if (!parsed.success) {
    return { ok: false, message: "That village is not valid." };
  }

  const result = await regenerateJoinCode({
    session,
    villageId: parsed.data.villageId,
  });

  if (!result.ok) return { ok: false, message: result.error };

  revalidateVillageSurfaces();

  return { ok: true, message: result.message, joinCode: result.joinCode };
}

export async function appointCoordinatorAction(
  _previous: VillageAdminState,
  formData: FormData,
): Promise<VillageAdminState> {
  const session = await requireAdmin("/admin/villages");

  const parsed = villageAppointSchema.safeParse({
    villageId: formData.get("villageId"),
    email: formData.get("email"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      message: "Enter the address they registered with.",
    };
  }

  const result = await appointCoordinator({
    session,
    villageId: parsed.data.villageId,
    email: parsed.data.email,
  });

  if (!result.ok) return { ok: false, message: result.error };

  revalidateVillageSurfaces();
  // Their sidebar gains the dashboard the moment their role changes.
  revalidatePath("/dashboard");

  return { ok: true, message: result.message };
}
