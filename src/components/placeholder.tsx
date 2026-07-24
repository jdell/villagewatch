import type { LucideIcon } from "lucide-react";

type PlaceholderProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** What this screen will do once it is built. */
  upcoming: readonly string[];
};

/**
 * Day 1 stand-in for a screen that is scaffolded but not yet implemented.
 * Delete the whole component once every route is real.
 */
export function Placeholder({
  icon: Icon,
  title,
  description,
  upcoming,
}: PlaceholderProps) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-100">
          <Icon className="size-6" aria-hidden />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-600">
            {description}
          </p>
        </div>
      </div>

      <div className="mt-8 rounded-2xl border border-dashed border-slate-300 bg-white p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Not built yet
        </p>
        <ul className="mt-4 space-y-2.5">
          {upcoming.map((item) => (
            <li key={item} className="flex items-start gap-3">
              <span
                className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-300"
                aria-hidden
              />
              <span className="text-base text-slate-700">{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
