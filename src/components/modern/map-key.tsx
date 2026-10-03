import { CalendarDays } from "lucide-react";
import { SEVERITIES } from "@/lib/constants";
import { HEATMAP_LEGEND_CSS } from "@/lib/heatmap";

/**
 * "How to read the map" — the key the design moves off the map and into the
 * filter sheet. A grid of four columns on `#f8fafc`, each a 46px swatch over an
 * 11px label, the handoff's `keyItems` layout.
 *
 * What the swatches *are* follows the pin system, so this component is the one
 * place to change when the pins change.
 */
export function MapKey() {
  return (
    <div className="grid grid-cols-4 gap-x-1.5 gap-y-3 rounded-[14px] bg-[#f8fafc] px-2 py-3.5">
      {SEVERITIES.map((severity) => (
        <KeyItem key={severity.value} label={severity.label}>
          <span
            className="size-5 rounded-full shadow-[0_1px_3px_rgba(15,23,42,.38),0_0_0_2px_#fff]"
            style={{ backgroundColor: severity.pin }}
          />
        </KeyItem>
      ))}
      <KeyItem label="Event">
        <span className="grid size-[26px] place-items-center rounded-[7px] border-2 border-[#0369a1] bg-white shadow-[0_1px_3px_rgba(15,23,42,.35)]">
          <CalendarDays className="size-3.5 text-[#0369a1]" strokeWidth={2.25} />
        </span>
      </KeyItem>
      <KeyItem label="Busier on the heatmap">
        <span
          className="h-2.5 w-12 rounded-full"
          style={{ background: HEATMAP_LEGEND_CSS }}
        />
      </KeyItem>
    </div>
  );
}

function KeyItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="flex h-[46px] items-center justify-center" aria-hidden>
        {children}
      </span>
      <span className="text-center text-[11px] leading-tight text-[#475569]">
        {label}
      </span>
    </div>
  );
}
