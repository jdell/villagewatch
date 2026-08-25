import Link from "next/link";
import { ArrowRight, Minus, TrendingDown, TrendingUp } from "lucide-react";

/**
 * One headline number, with either its change against the previous period or a
 * sentence saying what it counts.
 *
 * The arrow direction and the colour are decided separately, because on this
 * dashboard they disagree: incidents going *up* is the bad case, so a rising
 * arrow is amber and a falling one is green. Colour is never the only signal —
 * the arrow and the "vs last week" label both carry it too.
 *
 * ## Two of the four cards have no trend, and that is deliberate
 *
 * `previous` is optional. Where it is absent the card renders `hint` instead of
 * an arrow, and the two callers that do this are the two figures a period does
 * not apply to:
 *
 * - **Waiting for review** is every unreviewed report in the village, all time.
 *   A report filed in March that nobody has read is still waiting today, and a
 *   pending figure that fell to zero because somebody selected "Last 7 days"
 *   would be the one number on the page that could say the work is done when it
 *   is not.
 * - **Active residents** is a state rather than a rate. An account is open or it
 *   is closed; there is no period over which that is a count.
 *
 * Rendering a trend for either would be a comparison against a window neither
 * figure is measured over — worse than no trend, because it would look like one.
 */

type StatCardProps = {
  label: string;
  value: number;
  /**
   * The same measure over the preceding window. Omit for a figure that is not
   * counted over a period — see above — and pass `hint` instead.
   */
  previous?: number;
  /** What the comparison window is, e.g. "vs the week before". */
  comparison?: string;
  /** What the figure counts, where there is no trend to show. */
  hint?: string;
  /** Where the number leads, for a card that is also a piece of work. */
  href?: string;
  /** The link's text. Required with `href` — an arrow on its own says nothing. */
  hrefLabel?: string;
};

export function StatCard({
  label,
  value,
  previous,
  comparison,
  hint,
  href,
  hrefLabel,
}: StatCardProps) {
  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
        {value}
      </p>

      {previous === undefined ? (
        hint && <p className="mt-2 text-sm text-slate-500">{hint}</p>
      ) : (
        <Trend
          value={value}
          previous={previous}
          comparison={comparison ?? ""}
        />
      )}

      {href && hrefLabel && (
        <Link
          href={href}
          className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700 transition hover:text-brand-800"
        >
          {hrefLabel}
          <ArrowRight className="size-4 shrink-0" aria-hidden />
        </Link>
      )}
    </div>
  );
}

function Trend({
  value,
  previous,
  comparison,
}: {
  value: number;
  previous: number;
  comparison: string;
}) {
  const change = value - previous;

  // A jump from 0 to 3 is not "+300%" — it is the first three. Percentages need
  // a baseline, so without one the card shows the count instead.
  const percent = previous === 0 ? null : Math.round((change / previous) * 100);

  const Icon = change === 0 ? Minus : change > 0 ? TrendingUp : TrendingDown;

  const tone =
    change === 0
      ? "text-slate-500"
      : change > 0
        ? "text-amber-700"
        : "text-safe-700";

  return (
    <p className={`mt-2 inline-flex items-center gap-1.5 text-sm ${tone}`}>
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="font-medium tabular-nums">
        {change === 0
          ? "No change"
          : percent === null
            ? `${change > 0 ? "+" : "−"}${Math.abs(change)}`
            : `${change > 0 ? "+" : "−"}${Math.abs(percent)}%`}
      </span>
      <span className="text-slate-500">{comparison}</span>
    </p>
  );
}
