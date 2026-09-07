"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
// No brand icon: lucide-react v1 dropped them, and a megaphone is the honest
// glyph anyway — the button copies a post for whatever the village actually
// uses, which is a Facebook page for most of them and a group or a newsletter
// for the rest.
import { Check, Loader2, Megaphone } from "lucide-react";
import { copyText } from "@/lib/clipboard";

/**
 * "Copy weekly post" — the village's week, on the clipboard, ready for Facebook.
 *
 * ## Fetch on press, not on render
 *
 * The obvious alternative is to build the text server-side in
 * `/dashboard/page.tsx` and pass it as a prop, which is what `CopyAlert` does.
 * That is right there and wrong here: an alert is about the one report a
 * coordinator has just approved, and this is a week's worth of reports on a page
 * a coordinator leaves open — a prop would be built on every render of Overview,
 * would go stale the moment anything was published, and would put a week of the
 * village's reports into the payload of a page whether or not anybody pressed
 * the button.
 *
 * The cost is that the text is not in hand when the gesture fires, which rules
 * out `navigator.share()` — see the note in `src/lib/clipboard.ts` about
 * spending the gesture. The clipboard has no such constraint, and copying is
 * what a coordinator needs anyway: Facebook's composer takes pasted text and
 * ignores prefilled `quote` more often than it honours it (see
 * `facebookShareUrl`).
 *
 * ## It shows the post before it is published
 *
 * A button that copies silently is a button somebody presses and then pastes
 * a village's week into a public feed unseen. The text drops into a `<pre>`
 * under it — the same shape `CopyAlert` uses, and selectable, so the case where
 * both clipboard paths are unavailable still leaves something a coordinator can
 * copy by hand rather than a claim that a copy happened.
 *
 * The failure path is `ExportCsvButton`'s: check the status, raise the route's
 * own `error` string, and never report a copy that did not land.
 */

/** How long the button stays saying "Copied!" before going back. */
const COPIED_MS = 2_000;

type SocialPostResponse = {
  text?: string;
  incidents?: number;
  error?: string;
};

export function CopyWeeklyPostButton() {
  const [pending, setPending] = useState(false);
  const [post, setPost] = useState<{ text: string; incidents: number } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  function markCopied() {
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  }

  /** Re-copying an already-fetched post, without asking the server again. */
  async function copyAgain(text: string) {
    if (await copyText(text)) {
      markCopied();
      toast.success("Copied — paste it into Facebook.");
      return;
    }

    toast.error("Could not reach the clipboard — select the text and copy it.");
  }

  async function handleClick() {
    if (post) {
      await copyAgain(post.text);
      return;
    }

    setPending(true);

    try {
      const response = await fetch("/api/digest/social");
      const result = (await response
        .json()
        .catch(() => ({}))) as SocialPostResponse;

      if (!response.ok || !result.text) {
        toast.error(result.error ?? "The post could not be built.");
        return;
      }

      setPost({ text: result.text, incidents: result.incidents ?? 0 });

      // Copied straight away, so one press is enough in the ordinary case. A
      // clipboard that refuses is not an error worth blocking on — the text is
      // on screen by now — so the toast says which of the two happened.
      if (await copyText(result.text)) {
        markCopied();
        toast.success("Copied — paste it into Facebook.");
      } else {
        toast.info("Post ready below — select the text and copy it.");
      }
    } catch {
      toast.error("Network error — check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : copied ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Megaphone className="size-4" aria-hidden />
        )}
        {pending
          ? "Building the post…"
          : copied
            ? "Copied!"
            : post
              ? "Copy weekly post again"
              : "Copy weekly post"}
      </button>

      {post && (
        /*
          `aria-live` because the panel appears in response to a press somewhere
          above it and a screen reader has no other way to know the post is
          ready. Polite rather than assertive — it is the outcome of a deliberate
          action, not an alert.
        */
        <div
          aria-live="polite"
          className="mt-3 w-full basis-full rounded-2xl border border-slate-200 bg-slate-50 p-4"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Megaphone className="size-4 text-slate-400" aria-hidden />
            This week&rsquo;s post
          </h3>

          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {post.incidents === 0
              ? "Nothing was published in the village this week. The post says so — a quiet week is worth posting."
              : `${post.incidents} published report${post.incidents === 1 ? "" : "s"} from the last seven days.`}{" "}
            It carries the type and the landmark of each one and no descriptions.
            Nothing is posted automatically — paste it into your village&rsquo;s
            Facebook page or group.
          </p>

          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-white p-3.5 font-sans text-sm leading-relaxed text-slate-800 ring-1 ring-slate-200">
            {post.text}
          </pre>

          <p className="mt-2 text-xs text-slate-400">
            A Facebook post is public — anyone can read, share and screenshot it.
            The join link carries your village&rsquo;s join code.
          </p>
        </div>
      )}
    </>
  );
}
