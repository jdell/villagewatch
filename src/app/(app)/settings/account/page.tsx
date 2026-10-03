import type { Metadata } from "next";
import { DeleteAccount } from "@/components/delete-account";
import { SubPageBar } from "@/components/you/sub-page-bar";
import { CARD_SHADOW } from "@/components/you/settings-list";
import { requireSession } from "@/lib/auth";

export const metadata: Metadata = { title: "Account" };

/**
 * The sign-in address, and closing the account — one of the sub-pages of "You".
 *
 * Its own page because deleting an account is the one irreversible thing a
 * resident can do to their own data, and it should be somewhere they went on
 * purpose rather than at the bottom of a list they were scrolling. The
 * confirmation is unchanged: type your own email (`DeleteAccount`).
 */
export default async function AccountSettingsPage() {
  const session = await requireSession("/settings/account");
  const email = session.user.email ?? "";

  return (
    <div className="min-h-full bg-[#f1f5f9] lg:bg-transparent">
      <div className="mx-auto w-full max-w-2xl lg:px-6 lg:py-8">
        <SubPageBar title="Account" />
        <div className="flex flex-col gap-5 px-4 pt-4 pb-8 lg:px-0">
          <section className={`flex flex-col gap-1 rounded-[18px] bg-white p-4 ${CARD_SHADOW}`}>
            <h2 className="text-[13.5px] font-semibold text-[#334155]">Email</h2>
            <p className="text-[15px] text-[#0f172a]">{email}</p>
            <p className="text-[12.5px] text-[#64748b]">
              Your sign-in address. Ask your coordinator if it needs to change.
            </p>
          </section>

          {/* Rendered for everyone with an email — which is everyone — because
              the right to erasure does not depend on having joined a village. */}
          {email && <DeleteAccount email={email} />}
        </div>
      </div>
    </div>
  );
}
