"use server";

import { revalidatePath } from "next/cache";
import { isSuperAdmin, requireAdmin } from "@/lib/auth";
import {
  activateVillage,
  appointCoordinator,
  reactivateVillage,
  regenerateJoinCode,
  suspendVillage,
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

/**
 * The above, plus the screens a *resident* of that village reads the status
 * through.
 *
 * Suspension is the first thing on this page that changes what somebody other
 * than an administrator sees. **What actually carries the banner to a resident
 * is not this call** — `(app)/layout.tsx` is `force-dynamic`, so it re-runs on
 * every request and their next page load reads the new status whatever happens
 * here. Worth stating plainly, because the opposite is the obvious assumption
 * and it would make `force-dynamic` look removable.
 *
 * What the two lines below do buy is the administrator's own browser: a server
 * action's `revalidatePath` clears the client Router Cache, which otherwise
 * holds a rendered segment for up to 30 seconds even on a dynamic route. Without
 * it an administrator who suspends their *own* village and clicks straight
 * through to `/incidents/new` can meet a wizard that is about to be refused by
 * the route behind it.
 */
function revalidateResidentSurfaces() {
  revalidateVillageSurfaces();
  revalidatePath("/", "layout");
  revalidatePath("/incidents/new");
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
  // Their sidebar gains the five coordinator tabs the moment their role
  // changes, and the settings tab is where the join code this just minted is
  // handed out.
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");

  return { ok: true, message: result.message };
}

/**
 * Super-administrator only, and checked here as well as in the module.
 *
 * A server action is a POST endpoint with a generated URL — reachable without
 * the page ever rendering — so hiding the button behind `isSuperAdmin` on the
 * card is a courtesy and not a gate. `requireAdmin()` establishes the session
 * and the first list; this adds the second; `src/lib/villages.ts` checks both
 * again next to the write. Three checks for the same reason `/admin/villages/merge`
 * has three: this is the pair of buttons that stops a running village working.
 */
async function requireSuperAdminSession() {
  const session = await requireAdmin("/admin/villages");

  if (!isSuperAdmin(session)) return null;

  return session;
}

const NOT_SUPER_ADMIN: VillageAdminState = {
  ok: false,
  message:
    "Suspending a village needs super-administrator access, which is granted by SUPER_ADMIN_EMAILS.",
};

export async function suspendVillageAction(
  _previous: VillageAdminState,
  formData: FormData,
): Promise<VillageAdminState> {
  const session = await requireSuperAdminSession();
  if (!session) return NOT_SUPER_ADMIN;

  const parsed = villageActionSchema.safeParse({
    villageId: formData.get("villageId"),
  });

  if (!parsed.success) {
    return { ok: false, message: "That village is not valid." };
  }

  const result = await suspendVillage({
    session,
    villageId: parsed.data.villageId,
  });

  if (!result.ok) return { ok: false, message: result.error };

  revalidateResidentSurfaces();

  return { ok: true, message: result.message };
}

export async function reactivateVillageAction(
  _previous: VillageAdminState,
  formData: FormData,
): Promise<VillageAdminState> {
  const session = await requireSuperAdminSession();
  if (!session) return NOT_SUPER_ADMIN;

  const parsed = villageActionSchema.safeParse({
    villageId: formData.get("villageId"),
  });

  if (!parsed.success) {
    return { ok: false, message: "That village is not valid." };
  }

  const result = await reactivateVillage({
    session,
    villageId: parsed.data.villageId,
  });

  if (!result.ok) return { ok: false, message: result.error };

  revalidateResidentSurfaces();

  // Present only where the village had somehow lost its code — see
  // `reactivateVillage`. The card renders it once, exactly as activation does.
  return { ok: true, message: result.message, joinCode: result.joinCode };
}
