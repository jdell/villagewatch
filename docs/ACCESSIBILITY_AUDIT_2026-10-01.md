# Accessibility audit — 1 October 2026

Idea 11 from `docs/COMMUNITY_FEEDBACK_2026-09-30.md`. A source-level review of
the report wizard, the map, the severity badges, the vote buttons, the
moderation queue, forms throughout, and navigation, against WCAG 2.1 AA.

This is a record of one pass, like `SECURITY_AUDIT_2026-08-29.md`: date the next
one rather than editing this one. It is read by people and rendered by nothing,
so it needs no `outputFileTracingIncludes` entry.

**How it was done.** Three read-only reviews of the source, each finding
checked against the code with a line reference, then the straightforward ones
fixed in the same commit as this document. Colour contrast was **computed**, not
judged by eye: Tailwind v4's palette is OKLCH, so each colour was converted to
sRGB and run through the WCAG relative-luminance formula. The behaviour that
only exists in a browser — the drawer's focus handling, pin names, popup focus,
the order of the map controls — was checked in a real browser against a scratch
page, at desktop and at 375px. **Nothing here has been tested with a screen
reader**, and that is the most important next step: source review finds missing
attributes, not whether the result makes sense to somebody listening to it.

---

## Summary

| Area | Found | Fixed here | Left, with what is needed |
| --- | --- | --- | --- |
| Navigation and shell | No skip link; mobile drawer had no dialog behaviour | Both | Public pages' skip link |
| Map | Pins announced as "button"; controls behind every pin; no text alternative | Names, order, popup focus, labelled region, list link | A real keyboard alternative to the map |
| Report wizard | Errors unannounced and unlinked; AI result unannounced; pin needs a mouse | All three, plus focus and labels | Jump to the failing step on publish |
| Forms | About half link no error to its field | Auth forms fully; four others announce | Link the remaining four |
| Vote buttons | Count change silent; focus lost mid-vote | Both | — |
| Moderation queue | Focus lost after every decision and every reveal | Reveal, note, interim heading focus | Focus the next card |
| Severity badges | — | Nothing needed: every badge passes | — |

---

## Colour contrast

Computed from `node_modules/tailwindcss/theme.css` (OKLCH → sRGB) and the
`--color-*` tokens in `src/app/globals.css`. Badge classes are in
`src/lib/constants.ts` (`SEVERITY_META`).

| Pair | Foreground | Background | Ratio | Needs | Result |
| --- | --- | --- | --- | --- | --- |
| LOW badge | `#008236` | `#f0fdf4` | 4.72:1 | 4.5:1 | Pass |
| MEDIUM badge | `#973c00` | `#fffbeb` | 6.84:1 | 4.5:1 | Pass |
| HIGH badge | `#c10007` | `#fef2f2` | 5.87:1 | 4.5:1 | Pass |
| CRITICAL badge | `#8200db` | `#faf5ff` | 6.58:1 | 4.5:1 | Pass |
| LOW pin | `#16a34a` | white | 3.30:1 | 3:1 | Pass |
| MEDIUM pin | `#d97706` | white | 3.19:1 | 3:1 | Pass |
| HIGH pin | `#dc2626` | white | 4.83:1 | 3:1 | Pass |
| CRITICAL pin | `#7c3aed` | white | 5.70:1 | 3:1 | Pass |
| Vote "down", pressed | `#bb4d00` | `#fffbeb` | 4.85:1 | 4.5:1 | Pass |
| Caption text, slate-500 | `#62748e` | white | 4.76:1 | 4.5:1 | Pass |
| Popup reference, slate-400 | `#90a1b9` | white | 2.63:1 | 4.5:1 | **Fail — fixed** |

- **Severity is never colour alone.** Every badge prints its label, the legend
  prints one beside each swatch, and every pin now has a spoken name.
- **LOW is the tightest margin** at 4.72:1. Do not lighten `green-700`.
- **Pins were measured against white**, standing in for the tiles. OpenStreetMap
  tiles are mostly light grey and cream, so MEDIUM's 3.19:1 may fall just under
  3:1 on some; the 2.5px white stroke round every pin is what carries it there.
  Red and purple pins sit close in hue for some forms of colour blindness —
  acceptable now pins have names, and worth a look if a pin's colour ever
  carries meaning the name does not.
- **Focus rings at 20% alpha** (`focus:ring-brand-500/20`, on about forty
  inputs) likely fail the 3:1 non-text contrast a focus indicator needs. The
  input's border also changes colour on focus, which carries some of it. A
  global `:focus-visible` outline now covers everything that draws no ring of
  its own; the inputs themselves are listed below.

---

## Fixed in this commit

### Navigation (`src/components/app-shell.tsx`, `src/app/layout.tsx`, `src/app/globals.css`)

- **Skip link.** "Skip to main content", the first focusable element on every
  authenticated page, visible on focus; `<main id="main" tabIndex={-1}>` is its
  target. WCAG 2.4.1. Verified first in the tab order; not yet seen on screen.
- **The mobile drawer is a modal dialog.** `role="dialog"`, `aria-modal`, a
  label; the menu button has `aria-expanded` and `aria-controls`; opening it
  focuses the close button, Escape closes it, closing returns focus to the
  menu button, and the page behind is `inert` while it is open. The backdrop is
  out of the tab order and the accessibility tree, so the panel's own close
  button is the one announced. Verified in a browser. WCAG 2.1.2, 2.4.3, 4.1.2.
- **A visible focus outline for everything that draws none.** `:focus-visible`
  in `@layer base`, so the inputs that style their own focus keep it. Fixes the
  faint default ring on the dark sidebar in Safari and the footer links.
- **`lang="en-GB"`**, matching `global-error.tsx`.

### Map (`incident-map.tsx`, `map-view.tsx`, `incident-location-map.tsx`)

- **Pins have names.** Leaflet makes each marker a focusable `role="button"` but
  applies `alt` only to `<img>` icons, and these are div icons — so every pin was
  announced as "button". Now: "High severity, Burglary: Shed broken into, 2
  days ago". Verified.
- **Controls before the map in the source.** The map and every pin (up to 500)
  are tab stops; with the map first, the period and layer controls were reached
  only after all of them. The overlays are absolutely positioned, so nothing
  moves on screen. Verified. WCAG 2.4.3.
- **Popup focus.** Opening a pin's popup moves focus to its "View details" link;
  closing it returns focus to the pin. Leaflet did neither, and the popup is
  later in the DOM than every other pin. Verified. One trap found while
  verifying, recorded in the code: the focus waits on a timeout, because
  `requestAnimationFrame` does not run in a background tab.
- **The map is a named region** — "Map of reported incidents in Histon", or
  "Map showing the approximate location of this incident". The dashboard's
  density thumbnail is hidden from assistive technology instead: its
  `<figcaption>` already says what it shows.
- **"See these as a list"** on the map's village card, to `/incidents` with the
  same period. The interim text alternative — see below for the real one.
- **The incident count announces** when the period or layer changes it.
- **The popup reference** moved from slate-400 (2.63:1) to slate-500 (4.76:1).
  It is the number a resident reads out to a PCSO.

### Report wizard (`incident-form.tsx`, `ai-preview.tsx`, `media-uploader.tsx`, `location-picker.tsx`)

- **Errors are linked and announced.** Each field's error has an id and
  `role="alert"`, and the field's `aria-describedby` points at it — and at its
  hint, where it has one. WCAG 3.3.1, 4.1.3.
- **The AI result is announced.** `role="status"` used to exist only inside the
  "Rewriting…" branch, which is unmounted the moment the rewrite comes back, so
  neither "this is the anonymised version" nor "not anonymised — your own
  words" was ever read out. The notice now sits in a live region that stays
  mounted. The second message is the one that matters most before Continue.
- **The pin can be placed from a keyboard.** "Drop pin at the centre of the
  map" reads the map's centre; Leaflet already pans a focused map with the
  arrow keys, so pan-then-drop is a full keyboard route where there was none.
  The map is labelled with those instructions, the pin's coordinates announce
  when it moves, and a location error is an alert. WCAG 2.1.1.
- **The success screen takes focus** when it replaces the wizard, so a
  screen-reader user hears that the report went live.
- **The step indicator** puts `aria-current="step"` on the step itself and says
  which steps are completed.
- **Media.** The hidden file input is out of the tab order (it was an invisible
  stop); "Dismiss" and "Remove" say which file; a video attachment has a name.

### Forms

- **Register and welcome** (`auth/register-form.tsx`, `auth/welcome-form.tsx`):
  the shared `Field` now points each native input at its hint and its error,
  and errors are alerts. The ids were rendered and nothing referenced them.
- **Settings, incident edit, coordinator application, WhatsApp channel:** errors
  now announce (`role="alert"`). Linking each input is listed below.
- **Archive reason:** the "Other" textarea had a placeholder and no label.
- **Village picker:** the "No village matches" line is no longer announced as an
  option inside the listbox.

### Vote buttons (`vote-buttons.tsx`)

- **The result is announced** — "You rated this more serious than it looks. 4
  rated it more serious, 1 less serious." — from the server's answer, and a
  failure is announced too. The count only lived in each button's label, which a
  screen reader does not re-read on the focused element.
- **`aria-disabled` instead of `disabled`** while a vote is in flight. Disabling
  the focused button dropped focus to `<body>` on every vote; the existing
  synchronous guard already blocks a second press.
- A visible focus ring.

### Moderation queue (`moderation-card.tsx`, `queue/page.tsx`, `copy-alert.tsx`)

- **Revealing the original wording** focuses the revealed text, a labelled
  region. The button that asked for it unmounts, and focus used to fall to
  `<body>` without the words ever being read out.
- **"Add a note"** focuses the textarea it opens.
- **After Approve or Reject**, focus goes to a "Waiting for review" heading at
  the top of the list rather than `<body>`. The heading also fixes the outline,
  which skipped from `<h1>` to the cards' `<h3>`s. This is the interim fix; the
  better one is below.
- **Repeated buttons say which report**: "Approve & alert VW-HIS-2026-0007".
- **The share buttons** no longer read their emoji aloud, and say that they open
  a new tab.

### Elsewhere

- **The onboarding tour** no longer swallows Escape meant for another widget. It
  listened on the window, so the Escape that closes the date picker, the village
  search or the new drawer also dismissed the tour — permanently. Its step text
  announces as Next moves through it.
- **The push prompt** is a labelled region, so it can be found, and its dismiss
  button says what it dismisses.

### After merging with the timeline slider and community events

This audit was written against `main` before #46 (the timeline slider) and #48
(community events) merged; the fixes were carried onto both when the branches
met.

- **Event pins are named** — "Event, Community clean-up: Litter pick on the
  rec, Sat, 4 Oct 2026, 10:00–12:00" — leading with "Event" so they cannot be
  confused with incident pins by somebody who cannot see that one is blue. Their
  popups take and return focus like an incident's. The event page's single-pin
  map is a named region.
- **The timeline and events controls come before the map** in the source, with
  the rest of the controls. Both were built accessible: the clock toggle has
  `aria-expanded` and `aria-controls`, each slider handle has a label and an
  `aria-valuetext` naming its date, the selected range announces, and the events
  toggle has `aria-pressed` and a name.
- **"See these as a list" follows the timeline.** When the slider narrows the
  map, the link carries the slider's own days as a custom range, so the list is
  what is drawn rather than the wider period behind it.

---

## Left, with what is needed

### Complex — not attempted here

1. **A keyboard and screen-reader alternative to the map.** The list link is a
   stopgap. The real version is a "List" view beside Pins / Heatmap / Both on
   `/map` itself, rendering the same filtered set — type, severity, time,
   landmark, a link to each — so the filters and the alternative cannot
   disagree. Then markers can take `keyboard: false` (or a roving tabindex), and
   the map stops being up to 500 tab stops. The heat layer's text equivalent is
   the same list, sorted by area. **Highest-value item left.**
2. **Focus the next card after Approve or Reject**, rather than the heading.
   `ModerationQueue` would remember the index being moderated and, once the
   revalidated list arrives, focus that index's heading (or the one before, or
   the alert panel, or the empty state). It has to survive a server round trip,
   which is why it is not a one-liner.
3. **The calendar grid** (`date-range-chip.tsx`): about sixty day buttons, each a
   tab stop, with no arrow-key grid navigation; days *inside* a range are not
   conveyed (only the two ends are `aria-pressed`); and focus is not moved into
   the popover on open. The labels and an instruction are straightforward; the
   roving-tabindex grid is the complex part.
4. **The wizard's type and severity choices** are `aria-pressed` buttons. A
   `role="radiogroup"` with arrow keys is the right pattern for a single choice,
   and their descriptions are only in `title`, which keyboard and touch users
   cannot reach.
5. **Reject has no confirmation.** Not a WCAG failure — 3.3.4 covers legal and
   financial submissions — and a product decision rather than an accessibility
   one: a confirm step, or a required note.

### Straightforward — next pass

- **Link the four remaining forms' inputs to their errors** — `settings-form.tsx`,
  `incident-edit-form.tsx`, `coordinator-apply-form.tsx`,
  `dashboard/whatsapp-channel-form.tsx`, about fifteen call sites. They announce
  now; they are not yet tied to the field.
- **Failed client-side validation should move focus** to the first invalid field
  on register, welcome and the interest form, and a failed publish in the wizard
  should go to the step with the problem rather than only toasting.
- **Radio-group errors** (`village-interest-fields.tsx`, `coordinator-apply-form.tsx`):
  `aria-describedby` on the `<fieldset>`.
- **The terms checkbox** on register and welcome: `aria-invalid` and a linked
  error; its links open a new tab without saying so.
- **The village picker** does not announce how many villages match.
- **Full-strength focus rings** on the ~40 inputs using `/20` alpha.
- **The public pages** (`/`, `/privacy`, `/terms`, the auth pages) have no skip
  link; the footer's column headings skip a level and the link groups are not a
  `<nav>`.
- **The edit panel in the preview step** (`ai-preview.tsx`) leaves focus on a
  button that unmounts when it opens and closes.
- **Upload progress** in the media uploader is not announced.

---

## Already done well

Worth saying, so the next pass does not undo it:

- Focus moves to the step's heading on every wizard transition, and an invalid
  step focuses its first invalid field.
- The village picker is a correct ARIA combobox: listbox, options,
  `aria-activedescendant`, arrow keys, Enter, Escape.
- The date picker popover is a labelled dialog that closes on Escape and returns
  focus to the chip; its day cells have full-date labels and each month table a
  caption.
- Map controls are real buttons with `aria-pressed`, grouped and labelled.
- The vote buttons are a labelled group with `aria-pressed` and the count in
  their names.
- Navigation uses `<nav>` landmarks with labels and `aria-current="page"`, and
  the Queue badge reads "N waiting for review" rather than a bare number.
- No `<img>` without alt text, no `onClick` on a non-interactive element, and no
  icon-only button without a name, across the whole of `src/`.
- Toasts go through sonner, whose region is live.
