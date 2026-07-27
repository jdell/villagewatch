import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { WelcomeForm } from "@/components/auth/welcome-form";
import type { VillageOption } from "@/components/auth/register-form";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Join your village",
  description: "Finish setting up your VillageWatch account.",
};

/**
 * The half of registration an identity provider cannot do.
 *
 * Google hands back a verified email and a name. It has no opinion about which
 * village somebody lives in, whether their coordinator gave them a join code,
 * or whether they accept the terms — and those are precisely the facts the rest
 * of the app is built on, since the village is the tenant boundary every
 * incident query is scoped by.
 *
 * Deliberately outside the `(app)` route group. The shell in there renders a
 * sidebar and a village name for a resident who has neither yet, and its layout
 * is what sends people here in the first place — nesting this underneath it
 * would be a redirect loop.
 */
export const dynamic = "force-dynamic";

async function getVillages(): Promise<VillageOption[]> {
  if (!process.env.DATABASE_URL) return [];

  return prisma.village.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      name: true,
      region: true,
      centerLat: true,
      centerLng: true,
      defaultZoom: true,
    },
    orderBy: { name: "asc" },
  });
}

/** Next.js 16: `searchParams` is a Promise and must be awaited. */
type WelcomePageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function WelcomePage({ searchParams }: WelcomePageProps) {
  const session = await requireSession("/welcome");

  // Already a resident. Nothing to finish, and re-rendering the form would
  // invite somebody to try changing their own village (domain rule 5).
  if (session.profile) {
    redirect("/map");
  }

  const { next } = await searchParams;
  const redirectTo =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/map";

  const villages = await getVillages();

  // Google sends the display name under one of two keys depending on the
  // account; neither is guaranteed, so fall back to something typeable.
  const metadata = session.user.user_metadata ?? {};
  const defaultFullName =
    typeof metadata.full_name === "string"
      ? metadata.full_name
      : typeof metadata.name === "string"
        ? metadata.name
        : "";

  return (
    <div className="flex flex-1 flex-col bg-slate-50">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <Logo />

          <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">
            One more step
          </h1>
          <p className="mt-1.5 text-sm text-slate-600">
            You&apos;re signed in. Tell us which village you&apos;re in and
            you&apos;re done — reports stay inside it, and personal details are
            stripped out before anyone else sees them.
          </p>

          <div className="mt-6">
            <WelcomeForm
              villages={villages}
              defaultFullName={defaultFullName}
              email={session.user.email ?? ""}
              next={redirectTo}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
