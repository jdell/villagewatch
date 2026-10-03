import type { Metadata } from "next";
import { ProfileForm } from "@/components/you/profile-form";
import { SubPageBar } from "@/components/you/sub-page-bar";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Profile" };

/** Name and street or area — one of the sub-pages of "You". */
export default async function ProfileSettingsPage() {
  const session = await requireSession("/settings/profile");
  const profile = session.profile;

  return (
    <div className="min-h-full bg-[#f1f5f9] lg:bg-transparent">
      <div className="mx-auto w-full max-w-2xl lg:px-6 lg:py-8">
        <SubPageBar title="Profile" />
        <div className="px-4 pt-4 pb-8 lg:px-0">
          <ProfileForm
            fullName={profile?.fullName ?? ""}
            addressLine={profile?.addressLine ?? ""}
            email={session.user.email ?? ""}
          />
        </div>
      </div>
    </div>
  );
}
