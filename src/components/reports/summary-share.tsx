"use client";

import { ShareButtons } from "@/components/share-buttons";
import {
  summaryShareLinks,
  type SummaryShareInput,
} from "@/lib/digest/format-summary-share";

/**
 * Facebook, WhatsApp and Email under one weekly summary card on `/reports`.
 *
 * The text is `formatSummaryShare`'s — the village and the week, the digest's
 * paragraph, and the 999 lines — and every button copies it before it opens
 * anything, the `CopyAlert` pattern, through the same `ShareButtons` row. There
 * is no separate Copy button: three destinations was the brief, and each of
 * them copies.
 *
 * The caller gates it (coordinators only); nothing here checks a role.
 */
export function SummaryShare(props: SummaryShareInput) {
  const links = summaryShareLinks(props);

  return (
    <div className="mt-3 border-t border-slate-100 pt-3" data-print-hide>
      <ShareButtons
        text={links.text}
        whatsappUrl={links.whatsapp}
        whatsappLabel="WhatsApp"
        facebookUrl={links.facebook}
        facebookLabel="Facebook"
        emailUrl={links.email}
      />
      <p className="mt-2 text-xs text-slate-400">
        Each button puts this summary on your clipboard first, with your
        village&rsquo;s name, the week and the 999 numbers around it — paste it
        if the box comes up empty. A Facebook post is public: read the summary
        through before you share it.
      </p>
    </div>
  );
}
