"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { BellRing, Check, Map, MessageSquarePlus, X } from "lucide-react";

/**
 * The four-step tour a resident sees the first time they reach the app.
 *
 * ## Why localStorage rather than the database
 *
 * `User.onboardedAt` exists in the schema and is deliberately not used here.
 * This is a device-local UI nicety: someone who has done the tour on their
 * phone and then signs in on a laptop is looking at a different screen size, a
 * different navigation layout and, on the desktop, a sidebar they have never
 * seen. Showing it again there is the right behaviour, not a bug — and it saves
 * a database write on every dismissal for something that changes nothing about
 * the account. If a cross-device version is ever wanted, `onboardedAt` is the
 * column for it.
 *
 * ## Why `useSyncExternalStore` for one boolean
 *
 * localStorage cannot be read during render — the server has no such thing, and
 * reading it in an effect and calling `setState` is the cascading-render pattern
 * React now lints against. `useSyncExternalStore` is the sanctioned way to read
 * an external store with a server snapshot: the server (and the hydration pass)
 * sees "already dismissed" and renders nothing, then the client's real snapshot
 * arrives. No flash of a tour card for a resident who finished it weeks ago, no
 * hydration mismatch, and dismissing it in one tab closes it in the others.
 *
 * ## Why it does not measure anything
 *
 * No popper, no floating-ui, no measuring of anchor rectangles. The card is
 * fixed to the bottom of the viewport and the step highlights its target
 * through a CSS attribute selector — `body[data-tour-step="map"]` picks out
 * `[data-tour="map"]` and rings it (see `globals.css`). That is the whole
 * mechanism. It cannot drift out of alignment on a resize, it costs no
 * dependency, and it degrades on mobile — where the sidebar is behind a drawer
 * — to a card that explains the same thing in words.
 *
 * The same trick keeps it from fighting the push prompt, which wants the same
 * corner: `body[data-tour-active]` hides the banner while the tour is running.
 * Asking for notification permission over the top of "here is your map" is how
 * a resident denies it permanently.
 */

const STORAGE_KEY = "villagewatch:tour-completed";

// ---------------------------------------------------------------------------
// The store
// ---------------------------------------------------------------------------

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // `storage` fires in the *other* tabs, so a resident who dismisses the tour
  // in one does not meet it again in the one they left open.
  window.addEventListener("storage", listener);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function hasCompleted(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    // Private browsing with storage blocked. Treat it as done: a tour that
    // cannot remember being dismissed would reappear on every navigation,
    // which is far worse than never showing it.
    return true;
  }
}

/** The server has no localStorage, so it renders the tour as already finished. */
function completedOnServer(): boolean {
  return true;
}

function markCompleted(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    // Nothing to do. Worst case the tour appears once more.
  }

  // `storage` does not fire in the tab that made the change, so notify by hand.
  for (const listener of listeners) listener();
}

// ---------------------------------------------------------------------------
// The steps
// ---------------------------------------------------------------------------

type Step = {
  /** Matches a `data-tour` attribute in the shell. Null for steps with no target. */
  target: "map" | "report" | "settings" | null;
  icon: typeof Map;
  title: string;
  body: string;
};

const STEPS: readonly Step[] = [
  {
    target: "map",
    icon: Map,
    title: "This is your map",
    body: "Every report your coordinator has published, colour-coded by how serious it is. Green is worth knowing about, purple means call 999 first.",
  },
  {
    target: "report",
    icon: MessageSquarePlus,
    title: "Report what you see here",
    body: "Say it in your own words. Names, registrations and faces are stripped out before anyone else reads it, and your location is blurred by about a hundred metres.",
  },
  {
    target: "settings",
    icon: BellRing,
    title: "Choose what reaches you",
    body: "Set how serious something has to be before you hear about it, and how close to home. You can narrow it to your own street or leave it village-wide.",
  },
  {
    target: null,
    icon: Check,
    title: "That is everything",
    body: "Your first report will sit with your coordinator until they approve it — that is what keeps the map worth reading. In an emergency, always call 999 first.",
  },
];

export function OnboardingTour() {
  const completed = useSyncExternalStore(
    subscribe,
    hasCompleted,
    completedOnServer,
  );

  const [step, setStep] = useState(0);

  const active = !completed;
  const target = active ? STEPS[step].target : null;

  // Syncing React state out to the DOM, which is what an effect is actually
  // for. Written to `body` rather than held in context because the elements
  // being ringed live in a different part of the tree, and a provider for one
  // CSS class is a lot of machinery for one CSS class.
  useEffect(() => {
    if (!active) return;

    document.body.dataset.tourActive = "1";

    return () => {
      delete document.body.dataset.tourActive;
    };
  }, [active]);

  useEffect(() => {
    if (!target) return;

    document.body.dataset.tourStep = target;

    return () => {
      delete document.body.dataset.tourStep;
    };
  }, [target]);

  const finish = useCallback(() => {
    markCompleted();
  }, []);

  const next = useCallback(() => {
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }, []);

  // Escape dismisses, as it does for every other overlay. A tour nobody can
  // close is an obstacle rather than an introduction.
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") finish();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, finish]);

  if (!active) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const Icon = current.icon;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="tour-title"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-4 shadow-xl sm:inset-x-auto sm:right-4"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
          <Icon className="size-5" aria-hidden />
        </span>

        <div className="min-w-0 flex-1">
          <p id="tour-title" className="text-sm font-semibold text-slate-900">
            {current.title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            {current.body}
          </p>

          <div className="mt-3.5 flex items-center justify-between gap-3">
            <ol className="flex items-center gap-1.5" aria-label="Tour progress">
              {STEPS.map((s, index) => (
                <li
                  key={s.title}
                  aria-current={index === step ? "step" : undefined}
                  className={`h-1.5 rounded-full transition-all ${
                    index === step
                      ? "w-5 bg-brand-600"
                      : index < step
                        ? "w-1.5 bg-brand-300"
                        : "w-1.5 bg-slate-200"
                  }`}
                >
                  <span className="sr-only">
                    Step {index + 1} of {STEPS.length}
                  </span>
                </li>
              ))}
            </ol>

            <div className="flex items-center gap-2">
              {!isLast && (
                <button
                  type="button"
                  onClick={finish}
                  className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-700"
                >
                  Skip
                </button>
              )}
              <button
                type="button"
                onClick={isLast ? finish : next}
                className="inline-flex h-9 items-center rounded-lg bg-brand-600 px-3.5 text-sm font-semibold text-white transition hover:bg-brand-700"
              >
                {isLast ? "Got it" : "Next"}
              </button>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={finish}
          aria-label="Close the tour"
          className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
