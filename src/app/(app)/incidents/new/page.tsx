import type { Metadata } from "next";
import { MessageSquarePlus } from "lucide-react";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Report an incident" };

export default function NewIncidentPage() {
  return (
    <Placeholder
      icon={MessageSquarePlus}
      title="Report an incident"
      description="The one screen that has to be fast. Target is under a minute, one-handed, outdoors."
      upcoming={[
        "Multi-step wizard: what happened → where → when → photos → review",
        "Validated by incidentReportSchema in src/lib/validations.ts",
        "Map pin picker with 'use my location', jittered by LOCATION_FUZZ_METERS before saving",
        "Direct-to-Supabase-Storage uploads, with EXIF stripped before the file is stored",
        "Submitted reports land in PENDING_REVIEW; the AI pass fills description, aiSummary and tags",
      ]}
    />
  );
}
