import type { Metadata } from "next";
import { LayoutDashboard } from "lucide-react";
import { Placeholder } from "@/components/placeholder";
import { requireCoordinator } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  // Coordinators, moderators and admins only — residents are sent to the map.
  await requireCoordinator("/dashboard");

  return (
    <Placeholder
      icon={LayoutDashboard}
      title="Coordinator dashboard"
      description="The moderation queue, village statistics, and every pattern alert that has fired."
      upcoming={[
        "Review queue for PENDING_REVIEW reports, showing raw and anonymised text side by side",
        "Publish / reject / resolve actions validated by incidentModerationSchema",
        "Every action writes an AuditLog row — including each read of raw report text",
        "Pattern alerts with acknowledge and dismiss, plus the incidents behind each cluster",
        "Resident verification: approve join requests and promote to VERIFIED_RESIDENT",
      ]}
    />
  );
}
