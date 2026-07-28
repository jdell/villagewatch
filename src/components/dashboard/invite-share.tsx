"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  ClipboardCopy,
  ExternalLink,
  MessageCircle,
  Share2,
  TriangleAlert,
} from "lucide-react";
import { QrInvite } from "@/components/qr-invite";
import { copyText } from "@/lib/clipboard";
import { buildInviteUrl, buildJoinUrl } from "@/lib/invite";
import { APP_NAME } from "@/lib/constants";

/**
 * How a coordinator gets their village's invite in front of residents.
 *
 * The half of I3 that was missing: activation mints a join code and
 * `/admin/villages` shows it once, and until now nothing shared it. Everything
 * here builds from the same `buildJoinUrl` the QR encodes, so the link in a
 * WhatsApp message, the link on the clipboard and the link inside the printed
 * code cannot come apart.
 *
 * ## The join code is on this screen, and that is a departure worth naming
 *
 * `/admin/villages` deliberately selects `joinCode` only to test whether one
 * exists, on the reasoning that the code is a credential and a page that renders
 * it puts it in the RSC payload of every visit. That reasoning is about a
 * platform administrator browsing 10,670 parishes they have nothing to do with.
 * This is a coordinator looking at their own village (domain rule 4 — the
 * village comes from their session, never from a parameter), and the code is the
 * thing they are here to hand out. Withholding it would leave the feature with
 * nothing to share.
 *
 * What follows is that the flyer is the exposure, not this panel: a code on a
 * noticeboard is readable by anybody who walks past it, which is the intended
 * behaviour of a noticeboard. `regenerateJoinCode()` is the answer if one ends
 * up somewhere it should not.
 *
 * ## No code yet
 *
 * A village that has never been activated has `joinCode` null, and
 * `checkVillageJoin` reads "no code set" as "no code required" — so there is
 * nothing here that would let anybody in, and an invite that cannot be accepted
 * is worse than no invite. The panel says what has to happen and who does it,
 * the same shape `ParishCouncilForm` uses for its unmigrated column.
 */

/** How long a button stays saying "Copied!". Matches `CopyAlert`. */
const COPIED_MS = 2_000;

type InviteShareProps = {
  villageName: string;
  slug: string;
  region: string | null;
  /** `Village.joinCode` — null for a village nobody has activated. */
  joinCode: string | null;
};

export function InviteShare({
  villageName,
  slug,
  region,
  joinCode,
}: InviteShareProps) {
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const joinUrl = buildJoinUrl({ slug, joinCode });
  const inviteUrl = buildInviteUrl({ slug, joinCode });

  /** What a coordinator sends to one resident, or posts to a group. */
  const message = joinCode
    ? `Join ${villageName} on ${APP_NAME} — report what you see, and see what your neighbours have reported.\n\n${joinUrl}\n\nJoin code: ${joinCode}`
    : `Join ${villageName} on ${APP_NAME} — report what you see, and see what your neighbours have reported.\n\n${joinUrl}`;

  function markCopied(what: "link" | "code") {
    setCopied(what);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), COPIED_MS);
  }

  async function copy(what: "link" | "code", value: string, label: string) {
    if (await copyText(value)) {
      markCopied(what);
      toast.success(`${label} copied`);
      return;
    }

    toast.error("Could not reach the clipboard — select the text and copy it.");
  }

  async function handleWhatsApp() {
    // Quiet, and best effort: the navigation is what was asked for, and a
    // clipboard failure must not stand in front of it. Same call `CopyAlert`
    // makes for the same reason.
    if (await copyText(message)) markCopied("link");

    window.open(
      `https://wa.me/?text=${encodeURIComponent(message)}`,
      "_blank",
      "noopener,noreferrer",
    );
  }

  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Share2 className="size-4 text-slate-400" aria-hidden />
        Share
      </h2>
      <p className="mt-0.5 text-xs text-slate-500">
        The invite link, the join code and a QR code for a noticeboard or a
        newsletter. Anyone who follows it can create an account in{" "}
        {villageName} — nothing else.
      </p>

      {!joinCode && (
        <div className="mt-4 flex gap-3 rounded-xl bg-amber-50 p-3.5 ring-1 ring-inset ring-amber-600/20">
          <TriangleAlert className="size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm leading-relaxed text-amber-900">
            <p className="font-medium">Your village has no join code yet</p>
            <p className="mt-1">
              A join code is minted when a platform administrator activates the
              village, and without one the link below cannot verify anybody. Ask
              whoever administers this deployment to activate {villageName}, then
              come back — everything here will carry the code.
            </p>
          </div>
        </div>
      )}

      <dl className="mt-4 space-y-3">
        <div className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200">
          <dt className="text-xs font-medium text-slate-500">Invite link</dt>
          <dd className="mt-1 break-all font-mono text-xs text-slate-800">
            {joinUrl}
          </dd>
        </div>

        {joinCode && (
          <div className="rounded-xl bg-slate-50 p-3.5 ring-1 ring-slate-200">
            <dt className="text-xs font-medium text-slate-500">Join code</dt>
            <dd className="mt-1 font-mono text-lg font-semibold tracking-widest text-slate-900">
              {joinCode}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => copy("link", joinUrl, "Invite link")}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          {copied === "link" ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <ClipboardCopy className="size-4" aria-hidden />
          )}
          {copied === "link" ? "Copied!" : "Copy link"}
        </button>

        <button
          type="button"
          onClick={handleWhatsApp}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <MessageCircle className="size-4" aria-hidden />
          Share on WhatsApp
        </button>

        {joinCode && (
          <button
            type="button"
            onClick={() => copy("code", joinCode, "Join code")}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            {copied === "code" ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <ClipboardCopy className="size-4" aria-hidden />
            )}
            {copied === "code" ? "Copied!" : "Copy code"}
          </button>
        )}

        {/*
          Opens in a new tab rather than navigating: the printable page carries
          the code in its query string, and coming back to the dashboard from it
          should not depend on the browser's history.
        */}
        <a
          href={inviteUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <ExternalLink className="size-4" aria-hidden />
          Printable page
        </a>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        The printable page needs no account, so it is the one to send to whoever
        runs the noticeboard. It carries the join code in its address — treat that
        link the way you would treat the code itself.
      </p>

      <div className="mt-4">
        <QrInvite
          slug={slug}
          villageName={villageName}
          region={region}
          joinCode={joinCode}
        />
      </div>
    </section>
  );
}
