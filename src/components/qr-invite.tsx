"use client";

import { useRef } from "react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { Download, Printer, QrCode } from "lucide-react";
import {
  INVITE_QR_DISPLAY_PX,
  INVITE_QR_PRINT_PX,
  INVITE_STEPS,
  buildJoinUrl,
} from "@/lib/invite";
import { APP_NAME } from "@/lib/constants";

/**
 * One village's invite as a QR code, on screen and on paper.
 *
 * The thing a coordinator actually wanted: a code to put on the village hall
 * noticeboard, in the parish newsletter, and at the bottom of a printed
 * agenda. Rendered on the dashboard for the coordinator's own village and on
 * `/invite/[slug]` for anybody they hand the link to.
 *
 * ## Two renders of the same value, on purpose
 *
 * The visible code is an **SVG**, because it is what prints: the print rules in
 * `globals.css` force every colour inside `[data-print-region]` to black on
 * transparent, which a `fill` attribute is untouched by and a CSS background
 * would not survive — and a vector scales to whatever the printer's DPI is
 * rather than to whatever the screen's was.
 *
 * The download is a **canvas**, off-screen and mounted the whole time, at
 * `INVITE_QR_PRINT_PX`. `qrcode.react` exposes no imperative renderer, so a
 * canvas is the only way to reach `toDataURL()`; drawing into it does not depend
 * on layout, which is why `hidden` costs nothing here. Arming it on click
 * instead would mean rendering, waiting for the effect, and then reading the
 * pixels — three things that can each be off by a frame, to save a bitmap.
 *
 * ## What is printed
 *
 * `[data-print-region]` marks the sheet: the QR, the village name, the join
 * code and the three steps. `window.print()` then produces that and nothing
 * else — no sidebar, no dashboard figures, no buttons (`data-print-hide`). The
 * code is printed as text beside the QR deliberately, because a scanner that
 * will not focus is common and typing six characters is the fallback.
 *
 * The rules in `globals.css` are global to the page, so this claims printing for
 * whatever page it is on: pressing Ctrl+P on the dashboard produces the invite
 * sheet rather than the dashboard. That is the intent — the sheet is the only
 * thing on either page anybody wants on paper — but it is worth knowing before
 * a second print region is added to one of them.
 */

type QrInviteProps = {
  /** `Village.slug`. Decides the link, not the label. */
  slug: string;
  villageName: string;
  /** The county or region, printed under the name so the right village is obvious. */
  region?: string | null;
  /**
   * `Village.joinCode`. Null renders the QR as a plain link to the join page,
   * which is honest — a village with no code has not been activated, and there
   * is nothing to encode that would let anybody in.
   */
  joinCode?: string | null;
  /** Heading above the sheet. */
  title?: string;
  /** Sits under the buttons, off the printed sheet. */
  hint?: string;
};

export function QrInvite({
  slug,
  villageName,
  region,
  joinCode,
  title = "Invite QR code",
  hint,
}: QrInviteProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const joinUrl = buildJoinUrl({ slug, joinCode });

  function handleDownload() {
    const canvas = canvasRef.current;

    if (!canvas) {
      toast.error("Could not build the image — print the sheet instead.");
      return;
    }

    try {
      const link = document.createElement("a");
      link.href = canvas.toDataURL("image/png");
      link.download = `villagewatch-${slug}-invite.png`;
      link.click();
    } catch {
      // `toDataURL` throws on a tainted canvas. Nothing here draws an external
      // image into it, so this is close to unreachable — but a download that
      // silently does nothing is the failure worth a sentence.
      toast.error("Could not save the image — print the sheet instead.");
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <QrCode className="size-4 text-slate-400" aria-hidden />
        {title}
      </h3>

      {/*
        The printed sheet. Everything a resident needs to join is inside this
        element, and everything that is not is outside it.
      */}
      <div data-print-region className="mt-4">
        <div className="flex flex-col items-center gap-4 rounded-xl bg-slate-50 p-5 ring-1 ring-slate-200 sm:flex-row sm:items-start sm:gap-6">
          <QRCodeSVG
            value={joinUrl}
            size={INVITE_QR_DISPLAY_PX}
            // Quiet zone. The specification asks for four modules and a QR
            // printed flush to a coloured panel is the classic reason a camera
            // never locks on.
            marginSize={4}
            // One level up from the default. A flyer on a noticeboard gets rain,
            // drawing pins and a fold through it; `M` recovers ~15% of the
            // modules and costs a slightly denser grid.
            level="M"
            title={`Join ${villageName} on ${APP_NAME}`}
            className="h-auto w-full max-w-[16rem] shrink-0 bg-white"
          />

          <div className="min-w-0 text-center sm:pt-1 sm:text-left">
            <p className="text-base font-semibold text-slate-900">
              {villageName}
            </p>
            {region && <p className="text-sm text-slate-500">{region}</p>}

            <p className="mt-3 text-sm text-slate-600">
              Scan to join {APP_NAME} for {villageName}
            </p>

            {joinCode ? (
              <p className="mt-3 text-sm text-slate-600">
                Join code:{" "}
                <span className="font-mono text-base font-semibold tracking-widest text-slate-900">
                  {joinCode}
                </span>
              </p>
            ) : (
              <p className="mt-3 text-sm text-amber-800">
                This village has no join code yet, so the code below will not let
                anybody in.
              </p>
            )}

            <ol className="mt-3 space-y-1 text-left text-sm text-slate-600">
              {INVITE_STEPS.map((step, index) => (
                <li key={step} className="flex gap-2">
                  <span className="font-semibold text-slate-400">
                    {index + 1}.
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>

            {/*
              The link in full, because a printed QR that nobody can scan is a
              printed dead end — and because a resident holding the sheet is
              entitled to see where the code sends them before they scan it.
            */}
            <p className="mt-3 break-all text-xs text-slate-400">{joinUrl}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2" data-print-hide>
        <button
          type="button"
          onClick={handleDownload}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          <Download className="size-4" aria-hidden />
          Download QR
        </button>

        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Printer className="size-4" aria-hidden />
          Print
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-400" data-print-hide>
        {hint ??
          `The download is ${INVITE_QR_PRINT_PX}px square — about 87mm at 300 DPI. Printing gives you the code, the village name and the instructions on one sheet.`}
      </p>

      {/*
        The download's source. `hidden` rather than off-screen: a canvas is
        drawn into by script and its bitmap does not depend on being laid out,
        so this costs nothing but the pixels.
      */}
      <div hidden aria-hidden>
        <QRCodeCanvas
          ref={canvasRef}
          value={joinUrl}
          size={INVITE_QR_PRINT_PX}
          marginSize={4}
          level="M"
        />
      </div>
    </div>
  );
}
