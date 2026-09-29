"use client";

import { useActionState, useState, useRef, useCallback } from "react";
import { Mail, FileText, Copy, Check, Loader2, Pencil, X } from "lucide-react";
import { toast } from "sonner";
import {
  generateMpLetterAction,
  type MpLetterState,
} from "@/app/(app)/reports/actions";
import { copyText } from "@/lib/clipboard";

/**
 * "Write to your MP" — generates a formal letter from the village's report
 * data, addressed to the constituency MP looked up from the village's postcode.
 *
 * Coordinator-only (the action enforces it). Sits beside the PDF download and
 * copy buttons on `/reports`.
 *
 * The letter is strategic — trends, scale, impact, resource asks. Operational
 * detail (times, days, patterns) goes to the police report instead.
 */

const INITIAL_STATE: MpLetterState = {
  letter: null,
  mpName: null,
  mpConstituency: null,
  mpEmail: null,
  mpAddress: null,
  message: "",
  ok: false,
};

export function MpLetterButton({
  rangeFields,
}: {
  rangeFields: { range: string; from: string; to: string };
}) {
  const [state, formAction, isPending] = useActionState(
    generateMpLetterAction,
    INITIAL_STATE,
  );
  const [showPanel, setShowPanel] = useState(false);
  const [editedLetter, setEditedLetter] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Track when the action completes to open the panel
  const prevOkRef = useRef(state.ok);
  if (state.ok && !prevOkRef.current && state.letter) {
    setShowPanel(true);
    setEditedLetter(null);
    setIsEditing(false);
  }
  prevOkRef.current = state.ok;

  const letterText = editedLetter ?? state.letter ?? "";

  const handleCopy = useCallback(async () => {
    if (await copyText(letterText)) {
      setCopied(true);
      toast.success("Letter copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Could not copy — select the text and copy manually.");
    }
  }, [letterText]);

  const handleEmail = useCallback(() => {
    if (!state.mpEmail) {
      toast.error("No email address found for this MP.");
      return;
    }
    const subject = encodeURIComponent(
      `Community Safety Concerns — ${state.mpConstituency ?? "Your Constituency"}`,
    );
    const body = encodeURIComponent(letterText);
    window.open(`mailto:${state.mpEmail}?subject=${subject}&body=${body}`);
  }, [state.mpEmail, state.mpConstituency, letterText]);

  const toggleEdit = useCallback(() => {
    if (isEditing) {
      // Save edits
      if (textareaRef.current) {
        setEditedLetter(textareaRef.current.value);
      }
      setIsEditing(false);
    } else {
      setIsEditing(true);
      // Focus the textarea after render
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isEditing]);

  return (
    <>
      {/* The trigger button — sits in the button row on /reports */}
      <form action={formAction}>
        <input type="hidden" name="range" value={rangeFields.range} />
        <input type="hidden" name="from" value={rangeFields.from} />
        <input type="hidden" name="to" value={rangeFields.to} />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Mail className="size-4" aria-hidden />
          )}
          {isPending ? "Looking up your MP…" : "Write to your MP"}
        </button>
      </form>

      {/* Error message */}
      {!state.ok && state.message && !isPending && (
        <p className="mt-2 text-sm text-red-600" data-print-hide>
          {state.message}
        </p>
      )}

      {/* Letter panel */}
      {showPanel && state.letter && (
        <div
          className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm"
          data-print-hide
        >
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Letter to {state.mpName ?? "your MP"}
              </h3>
              {state.mpConstituency && (
                <p className="mt-0.5 text-sm text-slate-500">
                  MP for {state.mpConstituency}
                  {state.mpEmail && (
                    <>
                      {" · "}
                      <span className="text-slate-600">{state.mpEmail}</span>
                    </>
                  )}
                </p>
              )}
            </div>
            <button
              onClick={() => setShowPanel(false)}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Letter body */}
          <div className="px-5 py-4">
            {isEditing ? (
              <textarea
                ref={textareaRef}
                defaultValue={letterText}
                className="w-full rounded-lg border border-slate-300 p-4 font-mono text-sm leading-relaxed text-slate-800 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                rows={24}
              />
            ) : (
              <div className="whitespace-pre-wrap rounded-lg bg-slate-50 p-4 font-serif text-sm leading-relaxed text-slate-800">
                {letterText}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
            <button
              onClick={toggleEdit}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <Pencil className="size-3.5" aria-hidden />
              {isEditing ? "Save edits" : "Edit"}
            </button>

            <button
              onClick={handleCopy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-600" aria-hidden />
              ) : (
                <Copy className="size-3.5" aria-hidden />
              )}
              {copied ? "Copied!" : "Copy letter"}
            </button>

            {state.mpEmail && (
              <button
                onClick={handleEmail}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sky-600 px-3 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700"
              >
                <Mail className="size-3.5" aria-hidden />
                Email MP
              </button>
            )}

            {/* TODO: PDF download — will be added with the letter PDF renderer */}
            <button
              onClick={() => {
                toast.info(
                  "PDF export coming soon. Use 'Copy letter' and paste into a document for now.",
                );
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              <FileText className="size-3.5" aria-hidden />
              Download PDF
            </button>
          </div>

          <p className="px-5 pb-4 text-xs text-slate-500">
            Review the letter before sending. Replace [YOUR NAME] and [YOUR
            ADDRESS] with your details, and [DATE] with today&rsquo;s date.
          </p>
        </div>
      )}
    </>
  );
}
