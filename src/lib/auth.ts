import { cache } from "react";
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { UserRole } from "@/generated/prisma/enums";
import type { User } from "@/generated/prisma/client";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { prisma } from "@/lib/prisma";
import { isAdminEmail, isSuperAdminEmail } from "@/lib/admin";
import { COORDINATOR_ROLES } from "@/lib/constants";

export type Session = {
  /** The Supabase auth user — identity only. */
  user: SupabaseUser;
  /**
   * The application profile row (village, role, preferences). Null when the
   * auth user exists but the profile has not been created yet, which happens
   * between sign-up and the first successful registration write.
   */
  profile: User | null;
};

/**
 * Returns the current session, or null when signed out.
 *
 * Uses `auth.getUser()`, not `auth.getSession()` — `getUser()` revalidates the
 * JWT against Supabase, so a revoked or tampered cookie is rejected. Wrapped in
 * React `cache` so a request that hits it from the layout and three Server
 * Components still makes one round trip.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  // Before env vars are configured, behave as signed out rather than throwing.
  if (!isSupabaseConfigured) return null;

  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return null;

  const profile = process.env.DATABASE_URL
    ? await prisma.user.findUnique({ where: { id: user.id } })
    : null;

  return { user, profile };
});

/**
 * Session or bust. Redirects to /login, preserving where the user was headed.
 */
export async function requireSession(nextPath?: string): Promise<Session> {
  const session = await getSession();

  if (!session) {
    const target = nextPath
      ? `/login?next=${encodeURIComponent(nextPath)}`
      : "/login";
    redirect(target);
  }

  return session;
}

/**
 * Session plus a role check. Residents hitting a coordinator route are sent
 * back to the map rather than to /login — they are signed in, just not allowed.
 */
export async function requireRole(
  roles: readonly UserRole[],
  nextPath?: string,
): Promise<Session> {
  const session = await requireSession(nextPath);

  if (!session.profile || !roles.includes(session.profile.role)) {
    redirect("/map");
  }

  return session;
}

/** Coordinator dashboard and moderation queue guard. */
export function requireCoordinator(nextPath?: string) {
  return requireRole(COORDINATOR_ROLES, nextPath);
}

/**
 * Whether this session belongs to a platform administrator.
 *
 * Decided by the **verified email on the auth user**, against `ADMIN_EMAILS` —
 * not by `User.role`. See `src/lib/admin.ts` for why, and for the one thing
 * that does still read the role (`vw_is_admin()` in the RLS policies).
 *
 * `session.user.email` rather than `session.profile.email`: the former comes
 * from the Supabase JWT that `getUser()` has just revalidated, the latter from
 * a row the profile write put there. They agree today, and if they ever stop
 * agreeing, the one to trust for an authorisation decision is the one the
 * identity provider signed. It also means an administrator is an administrator
 * before they have a profile row at all.
 */
export function isPlatformAdmin(session: Session | null): boolean {
  return isAdminEmail(session?.user.email);
}

/**
 * Platform administrator guard, for the `/admin` routes.
 *
 * Narrower than `requireCoordinator()` and not a superset of it: a coordinator
 * moderates one village's reports, an administrator decides who gets to. The
 * only screen behind this today is the coordinator request queue, which is
 * deliberately not village-scoped — see `src/lib/coordinator-requests.ts`.
 *
 * Fails closed. With `ADMIN_EMAILS` unset nobody matches, so this refuses
 * everyone rather than admitting anyone — an empty allow-list is an empty
 * allow-list, not a disabled check.
 */
export async function requireAdmin(nextPath?: string): Promise<Session> {
  const session = await requireSession(nextPath);

  if (!isPlatformAdmin(session)) {
    // Same destination as `requireRole`: they are signed in, just not allowed,
    // and bouncing them to /login would invite them to try another account.
    redirect("/map");
  }

  return session;
}

/**
 * Whether this session may perform an operation that cannot be undone.
 *
 * Decided against `SUPER_ADMIN_EMAILS`, and it is **not** implied by
 * `isPlatformAdmin` — see `src/lib/admin.ts` for why the two lists are
 * separate. Reads `session.user.email` for the reason `isPlatformAdmin` does:
 * it is the address the identity provider signed.
 */
export function isSuperAdmin(session: Session | null): boolean {
  return isSuperAdminEmail(session?.user.email);
}

/**
 * The village the current user belongs to. Every incident query must be scoped
 * by this — it is the tenant boundary.
 */
export async function getCurrentVillageId(): Promise<string | null> {
  const session = await getSession();
  return session?.profile?.villageId ?? null;
}
