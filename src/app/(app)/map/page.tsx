import type { Metadata } from "next";
import { Map } from "lucide-react";
import { Placeholder } from "@/components/placeholder";

export const metadata: Metadata = { title: "Map" };

export default function MapPage() {
  return (
    <Placeholder
      icon={Map}
      title="Live incident map"
      description="Every published report in your village, plotted and colour-coded by severity."
      upcoming={[
        "Leaflet map centred on the village, using the village's own viewport",
        "Severity-coloured pins driven by SEVERITY_PIN_COLORS in src/lib/constants.ts",
        "Marker clustering, plus filters for type, severity and date range",
        "Incident preview card on pin click, deep-linking to the full report",
        "react-leaflet must be loaded with next/dynamic and ssr:false — Leaflet touches window on import",
      ]}
    />
  );
}
