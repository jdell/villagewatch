import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Never prerender anything behind auth. Reading cookies would normally force
 * this anyway, but before Supabase env vars are set `getSession()` short-
 * circuits without touching them — and Next would happily bake a redirect to
 * /login into a static page.
 */
export const dynamic = "force-dynamic";

/**
 * Authenticated shell for every signed-in route.
 *
 * `src/proxy.ts` already bounces signed-out users, but that is an optimistic
 * check — this layout is the one that actually guarantees a session before any
 * child renders.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const profile = session.profile;

  const village =
    profile?.villageId && process.env.DATABASE_URL
      ? await prisma.village.findUnique({
          where: { id: profile.villageId },
          select: { name: true },
        })
      : null;

  return (
    <AppShell
      user={{
        id: session.user.id,
        name: profile?.fullName ?? session.user.email ?? "Resident",
        email: session.user.email ?? "",
        role: profile?.role ?? null,
        villageName: village?.name ?? null,
        // Defaults to true for an auth user whose profile row does not exist
        // yet, matching the schema default — the prompt is the thing that asks,
        // and it still cannot fire without a browser permission.
        notifyPush: profile?.notifyPush ?? true,
      }}
    >
      {children}
    </AppShell>
  );
}
