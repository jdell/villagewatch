"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
