/**
 * A counted breakdown as labelled bars.
 *
 * Deliberately not a charting library. Every one of these is a single-series
 * horizontal bar chart of at most a dozen rows, which CSS already draws — and a
 * charting dependency would be a client bundle on a page that is otherwise a
 * pure Server Component. The number is always rendered as text beside the bar,
 * so the bar is decoration and the table is the data.
 */

export type BreakdownRow = {
  key: string;
  label: string;
  count: number;
  /** Bar colour as hex, when the row has a meaningful one (severity). */
  colour?: string;
};

export function BreakdownBar({
  rows,
  emptyMessage,
}: {
  rows: readonly BreakdownRow[];
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  // Bars are scaled against the largest row, not the total, so a breakdown
  // where one category dominates still shows the smaller ones.
  const max = Math.max(...rows.map((row) => row.count));

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[9rem_1fr_2.5rem] items-center gap-3">
          <span className="truncate text-sm text-slate-700" title={row.label}>
            {row.label}
          </span>

          <span
            className="h-2.5 rounded-full bg-slate-100"
            role="presentation"
          >
            <span
              className="block h-full rounded-full bg-brand-500"
              style={{
                width: `${Math.max(4, (row.count / max) * 100)}%`,
                backgroundColor: row.colour,
              }}
            />
          </span>

          <span className="text-right text-sm font-medium tabular-nums text-slate-900">
            {row.count}
          </span>
        </li>
      ))}
    </ul>
  );
}
