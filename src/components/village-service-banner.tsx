import Link from "next/link";
import { PauseCircle } from "lucide-react";
import type { VillageStatus } from "@/generated/prisma/enums";

/**
 * What a resident is told when their village is not in service.
 *
 * Rendered by `(app)/layout.tsx` above every authenticated page, so a resident
 * finds out on whatever screen they happen to open rather than at the end of the
 * report wizard. A **Server Component on purpose**: the layout already knows the
 * status, the banner has no state and no handler, and making it a client one
 * would ship a component to every browser to render nothing in the ordinary
 * case.
 *
 * ## It is not dismissible, and it says what still works
 *
 * Not dismissible because it is a state to leave rather than a notice to
 * acknowledge — the same reasoning the compliance banner carries. The
 * `/dashboard` one is aimed at the person who can fix it; this one is aimed at
 * somebody who cannot, so it does the opposite job: it says what has *not*
 * changed. A resident whose village went quiet needs to know their reports are
 * still there before they need to know why, and "suspended" with nothing after
 * it reads like data being taken away.
 *
 * The wording is `VILLAGE_SERVICE_MESSAGES` in `constants.ts`, beside the
 * refusals the sign-up screens use, so the message a resident sees and the one a
 * hand-crafted POST gets back cannot drift.
 */
export function VillageServiceBanner({
  status,
  message,
  villageName,
}: {
  /** Null when the status could not be read — see `getVillageServiceState`. */
  status: VillageStatus | null;
  message: string;
  villageName: string | null;
}) {
  return (
    <div
      role="status"
      className="border-b border-amber-200 bg-amber-50 px-4 py-3 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-5xl gap-3">
        <PauseCircle
          className="mt-0.5 size-5 shrink-0 text-amber-600"
          aria-hidden
        />
        <div className="min-w-0 text-sm leading-relaxed text-amber-900">
          <p className="font-semibold">
            {status === "SUSPENDED"
              ? `${villageName ?? "Your village"} is suspended`
              : `${villageName ?? "Your village"} is not taking new reports`}
          </p>
          <p className="mt-0.5">{message}</p>
          {/*
            The two numbers, and they are the point of putting this above every
            page rather than only on the wizard. Somebody who cannot file a
            report needs to know where the real emergency route is at the moment
            they find out, not one screen later — the same reason
            `/incidents/new` carries them.
          */}
          <p className="mt-1 text-amber-800">
            In an emergency call <strong>999</strong>. For non-urgent police
            matters call <strong>101</strong>. You can still open{" "}
            <Link href="/map" className="font-medium underline underline-offset-2">
              the map
            </Link>{" "}
            and everything already on it.
          </p>
        </div>
      </div>
    </div>
  );
}
