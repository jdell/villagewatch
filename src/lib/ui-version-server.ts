import { cache } from "react";
import { cookies } from "next/headers";
import type { Session } from "@/lib/auth";
import { getSession } from "@/lib/auth";
import { auditContext } from "@/lib/audit-context";
import { isCoordinatorRole } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_UI_VERSION,
  UI_VERSION_COOKIE,
  parseUiVersion,
  resolveUiVersion,
  type UiVersion,
} from "@/lib/ui-version";

/**
 * The server half of the UI version flag — the column, the cookie and the
 * audited write. The rules themselves are in `src/lib/ui-version.ts`, which is
 * pure and client-safe.
 */

// ---------------------------------------------------------------------------
// The village setting
// ---------------------------------------------------------------------------

/**
 * The village's version, and whether the column exists to hold one.
 *
 * Two parts for the reason `readVillageEventsSetting` gives, and it degrades
 * the same way: the app layout reads this on **every** authenticated render, so
 * a database behind on `20261003120000_village_ui_version` must cost the flag
 * rather than every page. Any error reads as `available: false` with classic,
 * which is what an unmigrated deployment shows anyway.
 */
export async function readVillageUiVersion(
  villageId: string,
): Promise<{ available: boolean; value: UiVersion }> {
  if (!process.env.DATABASE_URL) {
    return { available: false, value: DEFAULT_UI_VERSION };
  }

  try {
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: { uiVersion: true },
    });
    return {
      available: true,
      value: resolveUiVersion({ village: village?.uiVersion }),
    };
  } catch (cause) {
    console.error("Could not read the UI version for village %s", villageId, cause);
    return { available: false, value: DEFAULT_UI_VERSION };
  }
}

export type UiVersionWrite =
  | { ok: true; changed: boolean; value: UiVersion }
  | { ok: false; error: string };

/**
 * Sets the village's version, as that village's coordinator.
 *
 * The village comes off the revalidated session profile and never a parameter
 * (domain rule 4), so there is no call that changes another village's
 * interface. Audited as `village.ui_version_changed` — neutral, since it
 * changes how the app looks and nothing about who sees what — and only when
 * the value actually moved. The audit write follows the act and is swallowed
 * if it fails, `saveEcopsSiteAction`'s rule.
 */
export async function setVillageUiVersion(input: {
  session: Session;
  uiVersion: UiVersion;
}): Promise<UiVersionWrite> {
  const { session, uiVersion } = input;
  const villageId = session.profile?.villageId;

  if (!process.env.DATABASE_URL) {
    return { ok: false, error: "The database is not configured." };
  }

  if (!villageId || !isCoordinatorRole(session.profile?.role)) {
    return { ok: false, error: "Only a village coordinator can change that." };
  }

  let before: UiVersion;

  try {
    const village = await prisma.village.findUnique({
      where: { id: villageId },
      select: { uiVersion: true },
    });

    if (!village) return { ok: false, error: "That village could not be found." };

    before = resolveUiVersion({ village: village.uiVersion });

    // Compared on the stored text, not the resolved value: a column holding
    // something unrecognised resolves to classic, and saving classic over it is
    // a real write that puts a valid value back.
    if (village.uiVersion === uiVersion) {
      return { ok: true, changed: false, value: uiVersion };
    }

    await prisma.village.update({
      where: { id: villageId },
      data: { uiVersion },
    });
  } catch (cause) {
    console.error("Could not save the UI version for village %s", villageId, cause);

    const code = (cause as { code?: unknown } | null)?.code;
    return {
      ok: false,
      error:
        code === "P2022" || code === "42703"
          ? "This village's database has not been updated for this setting yet. Ask an administrator to apply the pending migration."
          : "Could not save the setting. Try again.",
    };
  }

  try {
    const context = await auditContext();

    await prisma.auditLog.create({
      data: {
        actorId: session.user.id,
        actorEmail: session.user.email ?? null,
        actorRole: session.profile?.role ?? null,
        villageId,
        action: "village.ui_version_changed",
        entityType: "village",
        entityId: villageId,
        before: { uiVersion: before },
        after: { uiVersion },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      },
    });
  } catch (cause) {
    console.error("Could not audit the UI version change for village %s", villageId, cause);
  }

  return { ok: true, changed: true, value: uiVersion };
}

// ---------------------------------------------------------------------------
// The resident's session override
// ---------------------------------------------------------------------------

/** The override cookie, narrowed. `null` when absent or unrecognised. */
export async function readUiVersionOverride(): Promise<UiVersion | null> {
  return parseUiVersion((await cookies()).get(UI_VERSION_COOKIE)?.value);
}

/**
 * What the signed-in resident sees: their override, else their village's, else
 * classic. Cached per request, so the layout and any Server Component below it
 * that asks share one read — this is how a Server Component reads the flag;
 * a Client Component reads `useUiVersion()` instead.
 */
export const getEffectiveUiVersion = cache(
  async (): Promise<{ village: UiVersion; effective: UiVersion }> => {
    const session = await getSession();
    const villageId = session?.profile?.villageId;

    const [village, override] = await Promise.all([
      villageId
        ? readVillageUiVersion(villageId).then((read) => read.value)
        : Promise.resolve(DEFAULT_UI_VERSION),
      readUiVersionOverride(),
    ]);

    return { village, effective: resolveUiVersion({ village, override }) };
  },
);
