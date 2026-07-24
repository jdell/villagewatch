import { cache } from "react";
import { redirect } from "next/navigation";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { UserRole } from "@/generated/prisma/enums";
import type { User } from "@/generated/prisma/client";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { prisma } from "@/lib/prisma";
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
 * The village the current user belongs to. Every incident query must be scoped
 * by this — it is the tenant boundary.
 */
export async function getCurrentVillageId(): Promise<string | null> {
  const session = await getSession();
  return session?.profile?.villageId ?? null;
}
