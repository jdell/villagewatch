import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <Placeholder
      icon={Settings}
      title="Settings"
      description="Your profile, your village, and exactly how much you want to be told."
      upcoming={[
        "Profile editing validated by profileSchema in src/lib/validations.ts",
        "Notification preferences: push, email, SMS, and a minimum severity threshold",
        "Web Push subscribe flow, persisting the subscription to User.pushSubscription",
        "Change password and sign out of other devices via Supabase Auth",
        "Export my data and delete my account — reports survive with reporterId set to null",
      ]}
    />
  );
}
