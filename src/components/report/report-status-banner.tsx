import {
  Archive,
  CircleCheck,
  Clock,
  Eye,
  ShieldX,
  type LucideIcon,
} from "lucide-react";
import type { ReportBannerKind } from "@/lib/incident-live";

/**
 * The one banner at the top of a report's page, saying where the report is.
 *
 * Which banner is `reportBannerKind`'s decision (`src/lib/incident-live.ts`);
 * this draws it. Each has its own colour, its own sentence and, where there is
 * something to do about it, one action — a link, so it works before the page
 * hydrates and the thing it points at is the control further down rather than a
 * second copy of it.
 *
 * - **In review** — amber. Not on the map yet.
 * - **Happening now** — red, with a pulsing dot (`motion-safe` only).
 * - **Published** — sky blue. On the map.
 * - **Resolved** — green, with a tick and the coordinator's note.
 * - **Rejected** / **archived** — slate. Off the map, said plainly.
 */

const STYLES: Record<
  ReportBannerKind,
  { box: string; icon: LucideIcon | null; iconClass: string; title: string }
> = {
  in_review: {
    box: "bg-[#fffbeb] ring-[#fde68a] text-[#78350f]",
    icon: Clock,
    iconClass: "text-[#d97706]",
    title: "In review",
  },
  happening_now: {
    box: "bg-[#fef2f2] ring-[#fecaca] text-[#7f1d1d]",
    icon: null,
    iconClass: "",
    title: "Happening now",
  },
  published: {
    box: "bg-[#f0f9ff] ring-[#bae6fd] text-[#0c4a6e]",
    icon: Eye,
    iconClass: "text-[#0284c7]",
    title: "Published",
  },
  resolved: {
    box: "bg-[#f0fdf4] ring-[#bbf7d0] text-[#14532d]",
    icon: CircleCheck,
    iconClass: "text-[#16a34a]",
    title: "Resolved",
  },
  rejected: {
    box: "bg-[#f8fafc] ring-[#e2e8f0] text-[#334155]",
    icon: ShieldX,
    iconClass: "text-[#64748b]",
    title: "Not published",
  },
  archived: {
    box: "bg-[#f8fafc] ring-[#e2e8f0] text-[#334155]",
    icon: Archive,
    iconClass: "text-[#64748b]",
    title: "Archived",
  },
};

type ReportStatusBannerProps = {
  kind: ReportBannerKind;
  /** Said after the title, lighter — a date, or "reported 20 min ago". */
  when?: string | null;
  text: string;
  action?: { href: string; label: string } | null;
};

export function ReportStatusBanner({
  kind,
  when,
  text,
  action,
}: ReportStatusBannerProps) {
  const style = STYLES[kind];
  const Icon = style.icon;

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-[18px] p-4 ring-1 ${style.box}`}
    >
      {Icon ? (
        <Icon className={`mt-0.5 size-5 shrink-0 ${style.iconClass}`} aria-hidden />
      ) : (
        <span className="relative mt-1.5 flex size-3 shrink-0" aria-hidden>
          <span className="absolute inline-flex size-full rounded-full bg-[#ef4444] opacity-75 motion-safe:animate-ping" />
          <span className="relative inline-flex size-3 rounded-full bg-[#dc2626]" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-[15px] font-semibold">
          {style.title}
          {when && <span className="font-normal opacity-75"> · {when}</span>}
        </p>
        <p className="text-[13.5px] leading-relaxed whitespace-pre-line opacity-90">
          {text}
        </p>
        {action && (
          <a
            href={action.href}
            className="mt-1 self-start text-[13.5px] font-semibold underline underline-offset-2"
          >
            {action.label}
          </a>
        )}
      </div>
    </div>
  );
}
