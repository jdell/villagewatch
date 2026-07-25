import { Minus, TrendingDown, TrendingUp } from "lucide-react";

/**
 * One headline number with its change against the previous period.
 *
 * The arrow direction and the colour are decided separately, because on this
 * dashboard they disagree: incidents going *up* is the bad case, so a rising
 * arrow is amber and a falling one is green. Colour is never the only signal —
 * the arrow and the "vs last week" label both carry it too.
 */

type StatCardProps = {
  label: string;
  value: number;
  /** The same measure over the preceding window. */
  previous: number;
  /** What the comparison window is, e.g. "vs the week before". */
  comparison: string;
};

export function StatCard({ label, value, previous, comparison }: StatCardProps) {
  const change = value - previous;

  // A jump from 0 to 3 is not "+300%" — it is the first three. Percentages need
  // a baseline, so without one the card shows the count instead.
  const percent =
    previous === 0 ? null : Math.round((change / previous) * 100);

  const Icon = change === 0 ? Minus : change > 0 ? TrendingUp : TrendingDown;

  const tone =
    change === 0
      ? "text-slate-500"
      : change > 0
        ? "text-amber-700"
        : "text-safe-700";

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <p className="text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1.5 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
        {value}
      </p>

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
    </div>
  );
}
