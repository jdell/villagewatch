"use client";

import { useState } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { reportFileName } from "@/lib/community-report";

/**
 * "Download PDF" on `/reports`.
 *
 * Fetches `GET /api/reports/[villageId]/pdf` and inspects the status before it
 * saves anything, rather than being an `<a href download>`. That is not a
 * preference: `download` saves whatever the server sends under the name it was
 * given, so a 401, a 403 or a 500 would land in the Downloads folder as a file
 * called `villagewatch-report-…pdf` that no reader could open, with nothing on
 * screen to say why. `ExportCsvButton` was fixed for exactly this and the route
 * returns JSON on every failure so that this can raise the reason.
 *
 * The period is carried in the query string, from the same resolved range the
 * page rendered — so the file covers what is on screen, and the route resolves
 * it again server-side rather than trusting the two dates.
 *
 * `analysis=ai` is the one thing that makes the download cost an Anthropic
 * call, and it is sent **only** once the coordinator has already generated an
 * analysis on screen. Sending it by default would put a paid call behind a
 * button a browser re-requests on a refresh; never sending it would hand
 * somebody who waited for the prose a document without it.
 */
export function DownloadPdfButton({
  villageId,
  report,
  rangeFields,
  withAnalysis,
}: {
  villageId: string;
  /** Only what the filename needs; the file itself is built server-side. */
  report: {
    villageName: string;
    from: Date | string | number;
    to: Date | string | number;
  };
  rangeFields: { range: string; from: string; to: string };
  /** True once an AI analysis is on screen. See the note above. */
  withAnalysis?: boolean;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);

    let objectUrl: string | null = null;

    try {
      const query = new URLSearchParams(rangeFields);
      if (withAnalysis) query.set("analysis", "ai");

      const response = await fetch(
        `/api/reports/${encodeURIComponent(villageId)}/pdf?${query}`,
      );

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        toast.error(result.error ?? "The PDF could not be downloaded.");
        return;
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        toast.error("The PDF came back empty. Try again in a moment.");
        return;
      }

      // The route names the file in `Content-Disposition`, but a blob URL
      // carries no headers for the browser to read it out of — so the same
      // name is rebuilt from the same function rather than left to a bare hash.
      objectUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `${reportFileName(report)}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();

      toast.success("Report downloaded.");
    } catch {
      toast.error("Network error — check your connection and try again.");
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      // The primary action on this screen. The PDF is the thing that actually
      // leaves the village — the copy, the print and the share are all a
      // coordinator moving the same document around by hand.
      className="inline-flex h-11 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <FileDown className="size-4" aria-hidden />
      )}
      {pending ? "Building the PDF…" : "Download PDF"}
    </button>
  );
}
