/**
 * Putting text on the clipboard, and handing it to whatever the device shares
 * with. **Browser only** — every function here touches `navigator` or
 * `document`, so this is imported from Client Components and nowhere else.
 *
 * It exists because there are now three surfaces that copy the same way — the
 * WhatsApp alert panel, the police summary on an incident, and the period
 * report — and the fallbacks below are the kind of thing that gets copied
 * once, diverges, and then only works on two of the three.
 */

/**
 * Copies through the async clipboard API, falling back to a hidden textarea.
 *
 * The fallback is what makes this work on `http://` — `navigator.clipboard` is
 * gated on a secure context, so a coordinator on a LAN deployment or a preview
 * over plain HTTP would otherwise get a button that silently does nothing.
 *
 * Returns whether the text actually landed. Callers must not claim a copy they
 * did not make: the text is on screen and selectable in all three places this
 * is used, and "select it and copy it" is a worse message than a working button
 * and a better one than a lie.
 */
export async function copyText(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Denied permission, or an insecure origin. Fall through.
  }

  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const copied = document.execCommand("copy");
    document.body.removeChild(area);
    return copied;
  } catch {
    return false;
  }
}

/** What `shareText` did, so the caller can word the toast honestly. */
export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

/**
 * Opens the device share sheet, falling back to the clipboard.
 *
 * ## Why this is not `await`ed before it is called
 *
 * `navigator.share()` must be invoked **inside the user gesture that triggered
 * it**. An `await` in front of it — a fetch, a server action, an audit write —
 * spends the gesture, and Safari on iOS then rejects the call with
 * `NotAllowedError`. That is the constraint that decides the shape of every
 * caller: whatever is going to be shared has to be a string already in hand
 * when the button is pressed, which is why the summaries are formatted on the
 * server and passed down as props rather than fetched on click.
 *
 * ## The three outcomes that are not failures
 *
 * - **No Web Share API at all.** Desktop Firefox and Chrome on Linux have
 *   none. The clipboard is the fallback, and it is the *expected* path on a
 *   laptop rather than a degradation — a coordinator writing to a PCSO is more
 *   likely to be pasting into an email client than tapping a share sheet.
 * - **`AbortError`.** The sheet opened and the user closed it. That is a
 *   decision, not an error, and showing "could not share" for it would be
 *   telling somebody their own choice failed. Reported as `cancelled` so the
 *   caller can stay quiet.
 * - **`NotAllowedError` / `DataError`.** A permissions policy or a payload the
 *   platform will not take. Falls through to the clipboard, which is always
 *   better than nothing happening.
 */
export async function shareText(input: {
  title: string;
  text: string;
}): Promise<ShareOutcome> {
  const payload = { title: input.title, text: input.text };

  // `canShare` first: Safari throws on a payload it will not take, and a
  // thrown share is indistinguishable from a cancelled one without this.
  if (navigator.share && (navigator.canShare?.(payload) ?? true)) {
    try {
      await navigator.share(payload);
      return "shared";
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        return "cancelled";
      }
      // Anything else — a permissions policy, an unsupported payload — falls
      // through to the clipboard rather than leaving the press with no effect.
    }
  }

  return (await copyText(input.text)) ? "copied" : "failed";
}
