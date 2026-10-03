import { BadgeCheck, Clock } from "lucide-react";
import { CARD_SHADOW } from "@/components/you/settings-list";
import { initials } from "@/lib/you";

/**
 * The card at the top of "You": an initials avatar on sky-600, the name, the
 * role and the village, whether a coordinator has verified them, and three
 * figures. Everything on it is the resident's own.
 *
 * The figures are `readYouStats`' — "Rated" rather than the design's
 * "witnessed", and "days a member" rather than "days active", for the reasons
 * that module gives. A figure that could not be read is a dash, not a zero.
 */
export function ProfileCard({
  name,
  roleLabel,
  villageName,
  verified,
  stats,
}: {
  name: string;
  roleLabel: string | null;
  villageName: string | null;
  verified: boolean;
  stats: { label: string; value: number | null }[];
}) {
  return (
    <section
      aria-label="Your profile"
      className={`flex flex-col gap-4 rounded-[18px] bg-white p-4 ${CARD_SHADOW}`}
    >
      <div className="flex items-center gap-3.5">
        <span
          className="grid size-14 shrink-0 place-items-center rounded-full bg-[#0284c7] text-[19px] font-[650] text-white"
          aria-hidden
        >
          {initials(name)}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <p className="truncate text-[18px] font-[650] text-[#0f172a]">
            {name || "Your name"}
          </p>
          <p className="truncate text-[13.5px] text-[#64748b]">
            {[roleLabel, villageName].filter(Boolean).join(" · ")}
          </p>
          {verified ? (
            <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[#f0fdf4] px-2 py-0.5 text-[12px] font-semibold text-[#15803d]">
              <BadgeCheck className="size-3.5" aria-hidden />
              Verified resident
            </span>
          ) : (
            <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[12px] font-semibold text-[#475569]">
              <Clock className="size-3.5" aria-hidden />
              Not yet verified
            </span>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-3 divide-x divide-[#f1f5f9] rounded-[14px] bg-[#f8fafc] py-2.5">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col items-center gap-0.5 px-1">
            {/* The term first in the source, as a <dl> wants; the figure first on
                screen, as the design draws it. */}
            <dt className="order-2 text-center text-[12px] text-[#64748b]">
              {stat.label}
            </dt>
            <dd className="order-1 text-[19px] font-[700] text-[#0f172a] tabular-nums">
              {stat.value === null ? "–" : stat.value.toLocaleString("en-GB")}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
