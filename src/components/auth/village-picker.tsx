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
 * The value the picker carries when somebody's village is not in the directory.
 *
 * **It is not a uuid, and that is what makes it safe.** Every real village id
 * is one, `registerSchema` requires `z.uuid()` for `villageId`, and
 * `checkVillageJoin` looks the id up before anything is written — so this
 * string cannot be mistaken for a village by any of the three gates a
 * registration passes through. It fails the schema rather than reaching the
 * database, which is the right way round: the form is what decides to show the
 * interest panel instead, and the server never has to know this value exists.
 */
export const UNLISTED_VILLAGE_ID = "unlisted";

/** One wording, used by the closed input and by the option in the list. */
const UNLISTED_LABEL = "My village isn't listed";

/**
 * What the list renders. The sentinel is an option in its own right rather than
 * a village with a fake id, so that nothing downstream can iterate the villages
 * and find it among them.
 */
type PickerOption =
  | { kind: "village"; village: VillageOption }
  | { kind: "unlisted" };

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

  /*
    A directory with nothing in it used to disable the input outright. It no
    longer can: "my village isn't listed" is a true and useful answer on a
    deployment with no villages, and it is the only one available there. What
    `empty` still decides is the wording of the hint under the search box.
  */
  const empty = villages.length === 0;
  const selected = villages.find((village) => village.id === value) ?? null;
  const unlistedChosen = value === UNLISTED_VILLAGE_ID;

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

  /*
    The unlisted option is **always last and always present** — it survives a
    query that matches nothing, and it is the only option at all on a
    deployment with an empty directory.

    That is the case it matters most in. Somebody whose village is not set up
    types its name, sees "No village matches", and on the old list that was the
    end of the road; it is exactly the person this form now has something to
    offer. It is not filtered by the query for the same reason: the search is
    over villages that exist, and this is the answer for a village that does
    not.
  */
  const options: PickerOption[] = [
    ...visible.map((village) => ({ kind: "village" as const, village })),
    { kind: "unlisted" as const },
  ];


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

  function commit(option: PickerOption) {
    onChange(
      option.kind === "village" ? option.village.id : UNLISTED_VILLAGE_ID,
    );
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
      if (options.length === 0) return;
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex(
        (index) => (index + step + options.length) % options.length,
      );
      return;
    }

    if (event.key === "Enter") {
      // Only swallow Enter while the popup is choosing something. Otherwise it
      // must keep submitting the form like any other field.
      if (open && options[activeIndex]) {
        event.preventDefault();
        commit(options[activeIndex]);
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
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && options[activeIndex]
              ? `${optionIdPrefix}-${activeIndex}`
              : undefined
          }
          aria-invalid={invalid}
          className={inputClass}
          placeholder={
            empty
              ? "No villages set up yet — tell us where you are"
              : "Search for your village"
          }
          // Typing shows the query; not typing shows the choice. Without this
          // the box would look empty again the moment focus left it.
          value={
            open
              ? query
              : unlistedChosen
                ? UNLISTED_LABEL
                : selected
                  ? labelFor(selected)
                  : ""
          }
          onChange={(event) => {
            setQuery(event.target.value);
            // Reset here rather than in an effect on `query`: a shorter list
            // must not leave the highlight past its end, and doing it in the
            // handler avoids a second render pass.
            setActiveIndex(0);
            if (!open) setOpen(true);
          }}
          onFocus={() => {
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

      {open && (
        <div className="absolute z-20 mt-1.5 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            aria-label="Villages"
            className="max-h-64 overflow-y-auto py-1"
          >
            {visible.length === 0 && (
              <li className="px-3.5 pb-2 pt-6 text-center text-sm text-slate-500">
                {empty ? (
                  "No villages are set up yet."
                ) : (
                  <>No village matches “{query.trim()}”.</>
                )}
                <span className="mt-1 block text-xs">
                  Only villages already set up on VillageWatch appear here — if
                  yours is missing, say so below.
                </span>
              </li>
            )}

            {options.map((option, index) => {
              const isActive = index === activeIndex;

              /*
                The unlisted row, always last. It carries a top border rather
                than sitting flush with the villages above it: it is a different
                kind of answer — "none of these" — and a row that looked like a
                fourteenth village would be chosen by accident.
              */
              if (option.kind === "unlisted") {
                return (
                  <li
                    key="unlisted"
                    id={`${optionIdPrefix}-${index}`}
                    role="option"
                    aria-selected={unlistedChosen}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      commit(option);
                    }}
                    onPointerEnter={() => setActiveIndex(index)}
                    className={`flex cursor-pointer items-center justify-between gap-3 border-t border-slate-100 px-3.5 py-2.5 text-sm ${
                      isActive ? "bg-brand-50 text-brand-900" : "text-slate-700"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {UNLISTED_LABEL}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        Tell us where you are and we will let you know
                      </span>
                    </span>
                    {unlistedChosen && (
                      <Check
                        className="size-4 shrink-0 text-brand-600"
                        aria-hidden
                      />
                    )}
                  </li>
                );
              }

              const village = option.village;
              const isSelected = village.id === value;

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
                    commit(option);
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
