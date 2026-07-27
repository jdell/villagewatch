import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { isPlatformAdmin, requireSession } from "@/lib/auth";
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

  // An authenticated user with no profile row has not finished registering.
  // Until Google sign-in that was only reachable by a registration whose auth
  // user was created and whose profile write then failed; now it is the normal
  // first visit for anyone arriving through a provider. Either way the app
  // proper has nothing to show them — every query is scoped by `villageId` and
  // they do not have one — so finish the job instead of rendering an empty
  // shell. `/welcome` sits outside this group, so this cannot loop.
  // A closed account (UK GDPR Article 17 — see `src/lib/erasure.ts`). The two
  // sign-in routes refuse it, so reaching here means a session that was already
  // open when the resident closed the account, most likely the very tab they
  // closed it from. `/account-closed` sits outside this group and signs them
  // out; sending them to `/welcome` instead would offer them a village to
  // rejoin, and `/login` would invite them to sign in to the one thing they
  // cannot.
  if (session.profile?.deletedAt) {
    redirect("/account-closed");
  }

  if (process.env.DATABASE_URL && !session.profile) {
    redirect("/welcome");
  }

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
        // Decided here rather than in the shell: `ADMIN_EMAILS` is server-only
        // and a Client Component cannot read it.
        isAdmin: isPlatformAdmin(session),
      }}
    >
      {children}
    </AppShell>
  );
}
