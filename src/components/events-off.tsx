import Link from "next/link";
import { CalendarOff } from "lucide-react";

/**
 * What every events page shows when the village has not turned them on. A
 * coordinator is told where the switch is; a resident is told it is their
 * coordinator's call, because there is nothing they can do about it.
 */
export function EventsOff({ coordinator }: { coordinator: boolean }) {
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-12 text-center sm:px-6">
      <span className="mx-auto grid size-11 place-items-center rounded-xl bg-slate-100 text-slate-500 ring-1 ring-slate-200">
        <CalendarOff className="size-5" aria-hidden />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-slate-900">
        Community events are not on in your village
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {coordinator
          ? "Turn them on in your village settings and residents can post litter picks, meetings and drop-ins for everyone to see."
          : "Your village coordinator can turn them on, and then anybody in the village can post a litter pick, a meeting or a drop-in."}
      </p>
      {coordinator && (
        <Link
          href="/dashboard/settings"
          className="mt-5 inline-flex h-10 items-center rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Village settings
        </Link>
      )}
    </div>
  );
}
