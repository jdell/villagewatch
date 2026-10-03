"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

/**
 * The bottom sheet — filters, the report flow, an incident,
 * the list and the trends all slide up over the map in one of these.
 *
 * The numbers are the design handoff's: `border-radius: 22px 22px 0 0`,
 * `box-shadow: 0 -6px 24px rgba(15,23,42,.12)`, white, full width. The foot
 * pads by the home-indicator inset so the last control is never under it.
 *
 * ## Modal or not
 *
 * `modal` sheets — the filters, the report flow — dim the map behind them with
 * `rgba(15,23,42,.35)`, take focus, close on Escape and on a tap on the dim,
 * and sit above the tab bar. That is the behaviour of a dialog because they are
 * one: the map behind is not usable while they are open.
 *
 * Non-modal sheets — an incident's detail, the list, the trends — leave the map
 * live above them, so a resident can tap another pin or drag the timeline
 * without closing anything. They sit above the tab bar too, since the design
 * draws them flush to the bottom edge, but nothing behind them goes inert.
 *
 * Whichever, the sheet is labelled by its own heading (`labelledBy`), and the
 * close control is the caller's — every sheet in the design has its own.
 *
 * ## Portalled to `<body>`, and it has to be
 *
 * Every sheet is opened from inside the map, and the map's wrapper is
 * `.map-surface` — an isolated stacking context, so that Leaflet's 200-1000
 * z-index scale stays inside it (see globals.css). A sheet rendered in place
 * is trapped in that context: whatever its own z-index, the tab bar outside it
 * draws on top, and the sheet's footer — its main button — ends up underneath.
 * Rendered into `<body>`, it stacks against the shell instead. A sheet only
 * ever opens after a tap, so `document` always exists by then.
 */

type BottomSheetProps = {
  open: boolean;
  onClose: () => void;
  /** The id of the heading inside that names the sheet. */
  labelledBy?: string;
  /** Plain-text name, where the sheet has no visible heading to point at. */
  label?: string;
  modal?: boolean;
  /** Tailwind max-height for the panel. The content scrolls inside it. */
  maxHeightClass?: string;
  children: React.ReactNode;
  /** A footer that stays put while the content scrolls — the sheet's main action. */
  footer?: React.ReactNode;
  className?: string;
};

export function BottomSheet({
  open,
  onClose,
  labelledBy,
  label,
  modal = false,
  maxHeightClass = "max-h-[86dvh]",
  children,
  footer,
  className = "",
}: BottomSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const fallbackId = useId();

  useEffect(() => {
    if (!open) return;

    const previous = document.activeElement as HTMLElement | null;
    if (modal) {
      // The first control, not the panel: a sheet whose first focus stop is a
      // container reads as nothing to a screen reader.
      panelRef.current
        ?.querySelector<HTMLElement>(
          "button, [href], input, textarea, select, [tabindex]:not([tabindex='-1'])",
        )
        ?.focus();
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      // Back to whatever opened it, so a keyboard user is not left on <body>.
      if (modal) previous?.focus?.();
    };
  }, [open, modal, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[1060] ${modal ? "" : "pointer-events-none"}`}
      data-print-hide
    >
      {modal && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={onClose}
          className="absolute inset-0 bg-[rgba(15,23,42,.35)] animate-[vw-backdrop-in_180ms_ease-out] motion-reduce:animate-none"
        />
      )}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={modal || undefined}
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : (label ?? fallbackId)}
        className={`pointer-events-auto absolute inset-x-0 bottom-0 mx-auto flex w-full max-w-xl flex-col rounded-t-[22px] bg-white shadow-[0_-6px_24px_rgba(15,23,42,.12)] animate-[vw-sheet-in_200ms_ease-out] motion-reduce:animate-none lg:bottom-4 lg:max-w-md lg:rounded-[22px] lg:shadow-[0_10px_32px_rgba(15,23,42,.18)] ${maxHeightClass} ${className}`}
      >
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-[#f1f5f9] px-4 pt-2.5 pb-[max(1.625rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
        {!footer && <div className="h-[env(safe-area-inset-bottom)] shrink-0" />}
      </div>
    </div>,
    document.body,
  );
}
