"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import type { VillageOption } from "@/components/auth/register-form";
import { ONS_ATTRIBUTION, ONS_LICENCE_URL } from "@/lib/constants";

/**
 * Type-to-search village picker, shared by `/register` and `/welcome`.
 *
 * Replaces the plain `<select>` both forms used to carry. A native select is
 * fine for the handful of villages a single deployment starts with and useless
 * the moment the ONS directory is seeded — Cambridgeshire alone is 270 parishes
 * and every English parish is 10,670, which is a scroll nobody can find their
 * own village in. It also cannot search on the region, and "Barnack" is only
 * unambiguous once you can see the county next to it.
 *
 * The list still arrives whole from the server and is filtered in the browser.
 * At a county's 270 that is nothing, and it keeps the component free of a
 * search endpoint, a debounce and a loading state. If the national directory is
 * ever activated wholesale this wants replacing with a server-side search —
 * `MAX_VISIBLE` caps what is *rendered*, not what is held in memory.
 */

/**
 * Options rendered at once. The cap is for the DOM, not the filter: a query
 * matching 4,000 villages should not build 4,000 nodes to show ten of them.
 */
const MAX_VISIBLE = 50;

/**
 * Folds case and strips diacritics so `Chrion` finds `A' Chrìon Làraich`.
 *
 * The IPN carries accented names and the seeder is careful to preserve them
 * (the encoding is sniffed rather than assumed, precisely so they survive). A
 * search that only matched the accented spelling would undo that for anyone
 * typing on a British keyboard.
 */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** What the input shows once a village is chosen, and what search matches on. */
function labelFor(village: VillageOption): string {
  return village.region ? `${village.name} — ${village.region}` : village.name;
}

type VillagePickerProps = {
  villages: VillageOption[];
  /** Selected village id, or "" for none. Carried into FormData as `villageId`. */
  value: string;
  onChange: (villageId: string) => void;
  invalid?: boolean;
  /** Field id, so the form's `<label htmlFor>` still points at the input. */
  id?: string;
  name?: string;
};

export function VillagePicker({
  villages,
  value,
  onChange,
  invalid = false,
  id = "villageId",
  name = "villageId",
}: VillagePickerProps) {
  const listboxId = useId();
  const optionIdPrefix = useId();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const empty = villages.length === 0;
  const selected = villages.find((village) => village.id === value) ?? null;

  // Precomputed once per list rather than per keystroke — `fold` allocates two
  // strings per entry and the directory is long enough for that to show.
  const haystack = useMemo(
    () =>
      villages.map((village) => ({
        village,
        search: fold(`${village.name} ${village.region ?? ""}`),
      })),
    [villages],
  );

  const matches = useMemo(() => {
    const needle = fold(query.trim());
    if (!needle) return villages;
    return haystack
      .filter((entry) => entry.search.includes(needle))
      .map((entry) => entry.village);
  }, [haystack, query, villages]);

  const visible = matches.slice(0, MAX_VISIBLE);
  const overflow = matches.length - visible.length;

  // Pointer down rather than click: a click that starts inside the popup and
  // ends outside it should not count as dismissing the popup.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  // Keyboard navigation is useless if the highlighted row is off-screen.
  useEffect(() => {
    if (!open) return;
    const node = listRef.current?.children[activeIndex];
    node?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  function commit(village: VillageOption) {
    onChange(village.id);
    setQuery("");
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (visible.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(
        (index) => (index + step + visible.length) % visible.length,
      );
      return;
    }

    if (event.key === "Enter") {
      // Only swallow Enter while the popup is choosing something. Otherwise it
      // must keep submitting the form like any other field.
      if (open && visible[activeIndex]) {
        event.preventDefault();
        commit(visible[activeIndex]);
      }
      return;
    }

    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setQuery("");
      }
      return;
    }

    if (event.key === "Tab" && open) {
      setOpen(false);
      setQuery("");
    }
  }

  const inputClass =
    "mt-1.5 block w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-9 text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 aria-invalid:border-red-400 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

  return (
    <div ref={rootRef} className="relative">
      {/*
        The value the form actually submits. Both auth forms read `villageId`
        out of FormData, so it has to exist as a named control — the visible
        input is a search box and deliberately carries no name.
      */}
      <input type="hidden" name={name} value={value} />

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 mt-0.5 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          ref={inputRef}
          id={id}
          type="text"
          autoComplete="off"
          spellCheck={false}
          disabled={empty}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && visible[activeIndex]
              ? `${optionIdPrefix}-${activeIndex}`
              : undefined
          }
          aria-invalid={invalid}
          className={inputClass}
          placeholder={
            empty ? "No villages available" : "Search for your village"
          }
          // Typing shows the query; not typing shows the choice. Without this
          // the box would look empty again the moment focus left it.
          value={open ? query : selected ? labelFor(selected) : ""}
          onChange={(event) => {
            setQuery(event.target.value);
            // Reset here rather than in an effect on `query`: a shorter list
            // must not leave the highlight past its end, and doing it in the
            // handler avoids a second render pass.
            setActiveIndex(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
            if (empty) return;
            setActiveIndex(0);
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 mt-0.5 size-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
      </div>

      {open && !empty && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Villages"
            className="max-h-64 overflow-y-auto py-1"
          >
            {visible.map((village, index) => {
              const isSelected = village.id === value;
              const isActive = index === activeIndex;
              return (
                <li
                  key={village.id}
                  id={`${optionIdPrefix}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  // Pointer down, not click: mousedown would blur the input and
                  // close the popup before the click ever landed.
                  onPointerDown={(event) => {
                    event.preventDefault();
                    commit(village);
                  }}
                  onPointerEnter={() => setActiveIndex(index)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3.5 py-2 text-sm ${
                    isActive ? "bg-brand-50 text-brand-900" : "text-slate-700"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {village.name}
                    </span>
                    {village.region && (
                      <span className="block truncate text-xs text-slate-500">
                        {village.region}
                      </span>
                    )}
                  </span>
                  {isSelected && (
                    <Check
                      className="size-4 shrink-0 text-brand-600"
                      aria-hidden
                    />
                  )}
                </li>
              );
            })}

            {visible.length === 0 && (
              <li className="px-3.5 py-6 text-center text-sm text-slate-500">
                No village matches “{query.trim()}”.
                <span className="mt-1 block text-xs">
                  Only villages already set up on VillageWatch appear here.
                </span>
              </li>
            )}
          </ul>

          {overflow > 0 && (
            <p className="border-t border-slate-100 bg-slate-50 px-3.5 py-2 text-xs text-slate-500">
              {overflow.toLocaleString("en-GB")} more — keep typing to narrow it
              down.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The Open Government Licence acknowledgement for the seeded directory.
 *
 * OGL v3.0 asks for this wherever the data is shown, which is here — the picker
 * is the only place a resident sees the ONS-derived villages. Rendered beside
 * the field rather than on a credits page, for that reason.
 */
export function VillageAttribution() {
  return (
    <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
      {ONS_ATTRIBUTION}{" "}
      <a
        href={ONS_LICENCE_URL}
        target="_blank"
        rel="noreferrer noopener"
        className="underline underline-offset-2 hover:text-slate-600"
      >
        Open Government Licence v3.0
      </a>
      .
    </p>
  );
}
