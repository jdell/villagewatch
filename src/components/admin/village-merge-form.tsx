"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import type {
  MergeCandidate,
  VillageMergePreview,
  VillageMergeSummary,
} from "@/lib/village-merge";

/**
 * The village merge form — two selectors, a preview, and a confirmation that
 * asks for the village's name in full.
 *
 * ## Why the preview is fetched rather than rendered on the server
 *
 * It has to change when either selector changes, and the numbers are the whole
 * point of the screen: an administrator who confirms without reading them is
 * the failure this page is shaped to prevent. `GET /api/admin/villages/merge`
 * is the same gate as the POST, so nothing is exposed by asking for it.
 *
 * ## The confirmation asks for the origin's name, typed out
 *
 * The pattern is `delete-account.tsx`'s and it is here for the same reason: a
 * button somebody can press twice by accident should not be the last thing
 * between them and an irreversible write. Typing the name also makes them read
 * *which* village is about to be archived, which is the mistake worth catching
 * — the two selectors look alike and swapping them destroys the wrong one.
 *
 * A `<select>` and a text input rather than a combobox, because this is an
 * operator screen used a handful of times in a deployment's life and
 * `village-picker.tsx` exists for the surface where a resident picks out of
 * 10,670.
 */

/**
 * "Histon (12 residents, 5 incidents) — active · histon-cambridgeshire"
 *
 * The counts are the point of the label: they are what tells an administrator
 * which of two similarly named parishes is the one people actually joined, and
 * therefore which way round the merge goes. The slug stays because names
 * collide — the ONS directory has 44 English name/county pairs that do — and
 * the status stays because only an `ACTIVE` village may be the target.
 */
function villageLabel(v: MergeCandidate): string {
  const residents = `${v.residents} resident${v.residents === 1 ? "" : "s"}`;
  const incidents = `${v.incidents} incident${v.incidents === 1 ? "" : "s"}`;

  return `${v.name} (${residents}, ${incidents}) — ${v.status.toLowerCase()} · ${v.slug}`;
}

/** One figure in the preview's grid. */
function Count({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 ring-1 ring-inset ring-slate-200">
      <p className="text-lg font-semibold tabular-nums text-slate-900">
        {value.toLocaleString("en-GB")}
      </p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}

export function VillageMergeForm({ villages }: { villages: MergeCandidate[] }) {
  const [originId, setOriginId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [renameTo, setRenameTo] = useState("");
  const [typed, setTyped] = useState("");

  /**
   * Off by default, so the common case is a short list of villages actually in
   * service. On, it adds the ones that are not in service but hold residents or
   * reports — which is the case this whole tool exists for: two parishes that
   * ought to be one, where people have already joined the wrong half.
   *
   * Both sets arrive from the server in the one payload
   * (`listMergeableVillages` returns `ACTIVE` ∪ has-data), so this filters what
   * is already here rather than fetching again. A round trip per toggle would
   * buy nothing — the whole list is a handful of rows however large the ONS
   * directory grows, because the seeded parishes are inert and excluded.
   */
  const [showAll, setShowAll] = useState(false);

  const [merging, setMerging] = useState(false);
  const [summary, setSummary] = useState<VillageMergeSummary | null>(null);

  /**
   * The preview is stored **keyed by the pair it describes**, and both
   * `preview` and `loadingPreview` are derived from that key rather than kept
   * as their own state.
   *
   * The obvious shape — `setPreview(null)` at the top of the effect when the
   * selection is incomplete — is a synchronous `setState` inside an effect,
   * which is the cascading render React lints against and the onboarding tour's
   * store exists to avoid. Deriving instead means the effect only ever writes
   * state from an async callback, and a stale preview cannot be rendered
   * against a pair nobody selected: if the key does not match, there is nothing
   * to show.
   */
  const [loaded, setLoaded] = useState<{
    key: string;
    data: VillageMergePreview;
  } | null>(null);
  const [failedKey, setFailedKey] = useState<string | null>(null);

  const pairKey =
    originId && targetId && originId !== targetId
      ? `${originId}:${targetId}`
      : "";

  const preview = loaded?.key === pairKey && pairKey ? loaded.data : null;
  const loadingPreview =
    pairKey !== "" && preview === null && failedKey !== pairKey;

  /**
   * Aborts the previous preview rather than racing it. Changing a selector
   * twice quickly would otherwise let the first response land last and describe
   * a pair nobody has selected.
   */
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!pairKey) return;

    const controller = new AbortController();
    inFlight.current?.abort();
    inFlight.current = controller;

    const [origin, target] = pairKey.split(":");

    fetch(
      `/api/admin/villages/merge?origin=${encodeURIComponent(origin!)}&target=${encodeURIComponent(target!)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) {
          throw new Error(body.error ?? "Could not read those villages.");
        }
        setLoaded({ key: pairKey, data: body as VillageMergePreview });
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "AbortError") return;
        setFailedKey(pairKey);
        toast.error(
          error instanceof Error ? error.message : "Could not read those villages.",
        );
      });

    return () => controller.abort();
  }, [pairKey]);

  /**
   * What the two selectors offer. `villages` is already `ACTIVE` ∪ has-data;
   * this narrows it to the active half unless the checkbox is on.
   */
  const visible = showAll
    ? villages
    : villages.filter((v) => v.status === "ACTIVE");

  /** The ones the checkbox reveals — named on its label so it is worth pressing. */
  const extras = villages.length - villages.filter((v) => v.status === "ACTIVE").length;

  /**
   * Turning the checkbox off must not leave a selection pointing at a village
   * that is no longer in the list: the `<select>` would render a value with no
   * matching `<option>`, which browsers resolve by silently showing the first
   * one — so the form would say a different village from the one it holds.
   */
  function toggleShowAll(next: boolean) {
    setShowAll(next);

    if (!next) {
      const stillThere = (id: string) =>
        villages.some((v) => v.id === id && v.status === "ACTIVE");

      if (originId && !stillThere(originId)) {
        setOriginId("");
        setTyped("");
      }
      if (targetId && !stillThere(targetId)) setTargetId("");
    }
  }

  const origin = villages.find((v) => v.id === originId) ?? null;
  const blocked = (preview?.blockers.length ?? 0) > 0;
  const confirmed =
    origin !== null && typed.trim().toLowerCase() === origin.name.toLowerCase();
  const canMerge = Boolean(preview) && !blocked && confirmed && !merging;

  async function merge() {
    if (!canMerge) return;

    setMerging(true);

    try {
      const response = await fetch("/api/admin/villages/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          originId,
          targetId,
          renameTo: renameTo.trim() || undefined,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        toast.error(body.error ?? "The merge did not run.");
        return;
      }

      setSummary(body as VillageMergeSummary);
      setTyped("");
      toast.success("The villages were merged.");
    } catch {
      toast.error("Could not reach the server. Nothing was changed.");
    } finally {
      setMerging(false);
    }
  }

  if (summary) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <span className="grid size-11 place-items-center rounded-xl bg-safe-50 text-safe-600 ring-1 ring-safe-100">
          <CheckCircle2 className="size-5" aria-hidden />
        </span>
        <h2 className="mt-4 text-base font-semibold text-slate-900">
          {summary.originName} was merged into {summary.targetName}
        </h2>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Count label="Residents moved" value={summary.usersMoved} />
          <Count label="Reports moved" value={summary.incidentsMoved} />
          <Count label="References changed" value={summary.incidentsRenumbered} />
          <Count label="Pattern alerts" value={summary.patternAlertsMoved} />
          <Count label="Applications" value={summary.coordinatorRequestsMoved} />
          <Count label="Police rows deleted" value={summary.policeCrimesDeleted} />
        </div>

        <p className="mt-5 rounded-xl bg-slate-50 p-3.5 text-sm leading-relaxed text-slate-600 ring-1 ring-inset ring-slate-200">
          {summary.originName} is archived and its join code no longer works.
          The full old-to-new reference mapping is on the{" "}
          <span className="font-medium text-slate-900">Village merged in</span>{" "}
          entry in {summary.targetName}&rsquo;s audit trail — that entry is what
          any reversal would be built from, so do not go looking for this
          information anywhere else.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {/*
          Rendered even when it would reveal nothing, and disabled instead. An
          administrator looking for a village that is not in the list needs an
          answer either way, and "no other villages hold any data" is the
          answer — a control that vanishes when the count is zero leaves them
          wondering whether the filter exists at all.
        */}
        <label
          className={`flex items-start gap-2.5 text-sm ${
            extras === 0 ? "cursor-not-allowed opacity-60" : "cursor-pointer"
          }`}
        >
          <input
            type="checkbox"
            checked={showAll}
            disabled={extras === 0}
            onChange={(event) => toggleShowAll(event.target.checked)}
            className="mt-0.5 size-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-2 focus:ring-brand-500/20"
          />
          <span>
            <span className="font-medium text-slate-700">
              Include villages that are not in service but hold data
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
              {extras === 0
                ? "No other villages hold any residents or reports. The seeded directory is not listed — an empty parish has nothing to merge."
                : `${extras} more ${extras === 1 ? "village has" : "villages have"} residents or reports without being in service. That is the case this tool is for: two parishes that ought to be one, where people have already joined the wrong half. The seeded directory is never listed.`}
            </span>
          </span>
        </label>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="merge-origin"
              className="block text-sm font-medium text-slate-700"
            >
              Origin village
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Emptied and archived.
            </p>
            <select
              id="merge-origin"
              value={originId}
              onChange={(event) => {
                setOriginId(event.target.value);
                setTyped("");
              }}
              className="mt-2 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Choose a village…</option>
              {visible.map((v) => (
                <option key={v.id} value={v.id} disabled={v.id === targetId}>
                  {villageLabel(v)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="merge-target"
              className="block text-sm font-medium text-slate-700"
            >
              Target village
            </label>
            <p className="mt-0.5 text-xs text-slate-500">
              Survives and receives everything. Must be in service.
            </p>
            <select
              id="merge-target"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              className="mt-2 block h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Choose a village…</option>
              {visible.map((v) => (
                <option key={v.id} value={v.id} disabled={v.id === originId}>
                  {villageLabel(v)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <label
            htmlFor="merge-rename"
            className="block text-sm font-medium text-slate-700"
          >
            Rename the target village (optional)
          </label>
          <input
            id="merge-rename"
            type="text"
            value={renameTo}
            onChange={(event) => setRenameTo(event.target.value)}
            placeholder="e.g. Histon &amp; Impington"
            maxLength={120}
            className="mt-2 block h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
          <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
            The display name only. The slug is deliberately left alone —
            <code className="mx-1">/join/&lt;slug&gt;</code> is printed on every
            invite sheet and QR code already handed out, and there is no
            redirect behind it.
          </p>
        </div>
      </div>

      {loadingPreview && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Reading both villages…
        </p>
      )}

      {preview && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            What moves out of {preview.origin.name}
          </h2>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <Count label="Residents" value={preview.origin.residents} />
            <Count label="Coordinators" value={preview.origin.coordinators} />
            <Count label="Reports" value={preview.origin.incidents} />
            <Count
              label="References that change"
              value={preview.origin.numberedIncidents}
            />
            <Count label="Pattern alerts" value={preview.origin.patternAlerts} />
            <Count
              label="Applications"
              value={preview.origin.coordinatorRequests}
            />
          </div>

          <p className="mt-4 text-sm text-slate-600">
            Into <span className="font-medium text-slate-900">
              {preview.target.name}
            </span>
            , which holds {preview.target.residents.toLocaleString("en-GB")}{" "}
            residents and {preview.target.incidents.toLocaleString("en-GB")}{" "}
            reports today.
          </p>

          {preview.blockers.length > 0 && (
            <div className="mt-5 rounded-xl bg-red-50 p-4 ring-1 ring-inset ring-red-600/20">
              <p className="text-sm font-semibold text-red-900">
                This merge cannot run
              </p>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-red-900">
                {preview.blockers.map((blocker) => (
                  <li key={blocker}>{blocker}</li>
                ))}
              </ul>
            </div>
          )}

          {preview.warnings.length > 0 && (
            <div className="mt-4 rounded-xl bg-amber-50 p-4 ring-1 ring-inset ring-amber-600/20">
              <p className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <TriangleAlert className="size-4" aria-hidden />
                Consequences
              </p>
              <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-amber-900">
                {preview.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {preview && !blocked && origin && (
        <div className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Confirm</h2>
          <label
            htmlFor="merge-confirm"
            className="mt-2 block text-sm leading-relaxed text-slate-600"
          >
            Type <span className="font-mono text-slate-900">{origin.name}</span>{" "}
            to confirm that it is the village being archived.
          </label>
          <input
            id="merge-confirm"
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            className="mt-2 block h-11 w-full rounded-lg border border-slate-300 px-3 text-sm text-slate-900 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
          />

          <button
            type="button"
            onClick={merge}
            disabled={!canMerge}
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"
          >
            {merging ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                Merging…
              </>
            ) : (
              <>
                Merge and archive {origin.name}
                <ArrowRight className="size-4" aria-hidden />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
