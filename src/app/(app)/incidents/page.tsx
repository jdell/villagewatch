import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Incidents" };

export default function IncidentsPage() {
  return (
    <Placeholder
      icon={ClipboardList}
      title="Incidents"
      description="A chronological list of what has been reported near you, newest first."
      upcoming={[
        "Cursor-paginated list scoped to the signed-in user's village",
        "Filters wired to incidentFilterSchema in src/lib/validations.ts",
        "Severity badges from SEVERITIES; only PUBLIC_INCIDENT_STATUSES are visible to residents",
        "Full-text search across title, anonymised description and tags",
        "Detail route at /incidents/[id] — remember params is a Promise in Next.js 16",
      ]}
    />
  );
}
