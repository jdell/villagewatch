"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireSession } from "@/lib/auth";
import { UI_VERSION_COOKIE } from "@/lib/ui-version";
import { readVillageUiVersion } from "@/lib/ui-version-server";
import { uiVersionOverrideSchema } from "@/lib/validations";

/**
 * A resident switching between the classic interface and the redesign for
 * their own browser session — the link in the sidebar footer.
 *
 * It writes a cookie and nothing else: no column, no audit row. It is one
 * person's view of the app, not a decision anybody is accountable for, and the
 * village's own setting is untouched.
 *
 * Choosing the village's own version **clears** the cookie rather than setting
 * it to the same value. An override equal to the default is invisible today and
 * wrong tomorrow: a coordinator who later moves the village would find this
 * resident still pinned to the old version for the rest of their session with
 * nothing on screen to say why.
 */
export async function setUiVersionOverrideAction(formData: FormData): Promise<void> {
  const session = await requireSession();

  const parsed = uiVersionOverrideSchema.safeParse({
    uiVersion: formData.get("uiVersion"),
  });
  if (!parsed.success) return;

  const villageId = session.profile?.villageId;
  const village = villageId
    ? (await readVillageUiVersion(villageId)).value
    : null;

  const jar = await cookies();

  if (parsed.data.uiVersion === village) {
    jar.delete(UI_VERSION_COOKIE);
  } else {
    jar.set(UI_VERSION_COOKIE, parsed.data.uiVersion, {
      // No `maxAge` and no `expires`: a session cookie, gone when the browser
      // closes. The override is "let me look at the other one", not a setting.
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    });
  }

  // The shell is in the root of the authenticated tree, so every page below it
  // re-renders with the new version.
  revalidatePath("/", "layout");
}
