"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

/**
 * The dashboard's "Export CSV" control.
 *
 * ## Why this is not an `<a href download>`
 *
 * It was, and that is what made the button appear broken. `download` saves
 * whatever the server sends under the filename it was given: a 401, a 403, a
 * 503 or an unhandled 500 all became a file called `export` full of JSON or
 * HTML, sitting in the Downloads folder looking like a corrupt spreadsheet.
 * There was no status code to react to, because nothing was reading one.
 *
 * Fetching instead means the response is inspected before anything is saved.
 * A failure raises a toast carrying the route's own `error` string — which is
 * why every exit from that route is JSON — and writes nothing to disk. Only a
 * 200 becomes a download.
 *
 * The object URL is revoked in a `finally`, so a coordinator exporting twice a
 * week for a year does not accumulate a year of blobs in the tab.
 */
export function ExportCsvButton() {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);

    let objectUrl: string | null = null;

    try {
      const response = await fetch("/api/dashboard/export");

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        toast.error(result.error ?? "The export could not be downloaded.");
        return;
      }

      const blob = await response.blob();

      if (blob.size === 0) {
        toast.error("The export came back empty. Try again in a moment.");
        return;
      }

      // The server names the file in `Content-Disposition`, but a blob URL has
      // no headers for the browser to read it out of — so the same name is
      // rebuilt here rather than left to the browser's default of a bare hash.
      const stamp = new Date().toISOString().slice(0, 10);

      objectUrl = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = `villagewatch-incidents-${stamp}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
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
      className="inline-flex h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        <Download className="size-4" aria-hidden />
      )}
      {pending ? "Building the file…" : "Export CSV"}
    </button>
  );
}
