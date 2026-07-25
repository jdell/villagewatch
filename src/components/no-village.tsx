import Link from "next/link";
import { MapPinOff } from "lucide-react";

/**
 * Shown wherever a signed-in resident has no village yet.
 *
 * Every incident query is scoped by `villageId` (domain rule 4), so a profile
 * without one has nothing to be shown rather than an empty list — and saying
 * "no incidents" would be misleading. The join code is the way out, and it
 * comes from a coordinator.
 */
export function NoVillage({
  title = "You are not in a village yet",
  description = "Reports belong to a village, so there is nothing to show until you have joined. Your coordinator can give you a join code.",
}: {
  title?: string;
  description?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-14 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center sm:p-8">
        <span className="mx-auto grid size-12 place-items-center rounded-xl bg-amber-50 text-amber-600 ring-1 ring-amber-100">
          <MapPinOff className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          {description}
        </p>
        <Link
          href="/settings"
          className="mt-5 inline-flex h-11 items-center rounded-lg bg-brand-600 px-5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Go to settings
        </Link>
      </div>
    </div>
  );
}
