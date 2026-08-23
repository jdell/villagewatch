"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUTH_REQUEST_TIMEOUT_MS } from "@/lib/auth-errors";

/**
 * The submit lock every auth form shares.
 *
 * Four things, and each of them was a real gap rather than a tidy-up:
 *
 * 1. **A synchronous double-click guard.** Every form already had a `pending`
 *    flag and a disabled button, and that is not the same thing. `setPending`
 *    schedules a render; two clicks inside the same frame both read the old
 *    state and both fire, so the first thing a resident does when a form feels
 *    slow — press it again — sent a second sign-up email and spent a second
 *    slot of the deployment's hourly quota. `inFlight` is a ref, so it is true
 *    before the second event handler runs.
 *
 * 2. **A watchdog.** A request that never settles used to leave the button
 *    disabled for good, with a spinner on it and no way forward but a reload.
 *    The matching `AbortSignal` is handed to `fetch`, so the request is
 *    genuinely abandoned rather than left racing the re-enabled button — one
 *    request in flight at a time, always.
 *
 * 3. **A cooldown.** When the server says it rate limited us, re-enabling the
 *    button immediately invites the press that cannot possibly work. The
 *    countdown is on the button's own label, because a toast that has faded is
 *    not an explanation for a button that does nothing.
 *
 * 4. **Somewhere for the timers to be cleared.** All of it unwinds on unmount,
 *    which matters here because `/register` and `/login` both navigate away
 *    from a form whose request may still be in flight.
 */

export type AuthSubmit = {
  /** A request is in flight. Drives the spinner and the "…" label. */
  pending: boolean;
  /** Seconds left before the button will accept another press. 0 when free. */
  cooldown: number;
  /** What the button's `disabled` should be. */
  disabled: boolean;
  /**
   * Take the lock. Returns false if a request is already in flight or the form
   * is cooling down — call it first and return early, do not assume the
   * disabled attribute got there in time.
   */
  begin: () => boolean;
  /** Release the lock. Safe to call twice; the watchdog may have got there first. */
  end: () => void;
  /** Refuse presses for `seconds`, after a rate-limited response. */
  hold: (seconds: number) => void;
  /** The abort signal for this attempt's `fetch`. */
  signal: () => AbortSignal;
};

export function useAuthSubmit(): AuthSubmit {
  const [pending, setPending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const inFlight = useRef(false);
  const cooling = useRef(false);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controller = useRef<AbortController | null>(null);

  // Everything the component owns, torn down in one place.
  useEffect(() => {
    return () => {
      if (watchdog.current) clearTimeout(watchdog.current);
      controller.current?.abort();
    };
  }, []);

  // The countdown. One interval for the whole hold rather than a timeout per
  // second, and it stops itself at zero so an idle form schedules nothing.
  useEffect(() => {
    if (cooldown <= 0) {
      cooling.current = false;
      return;
    }

    cooling.current = true;
    const timer = setInterval(() => {
      setCooldown((seconds) => (seconds <= 1 ? 0 : seconds - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldown]);

  const end = useCallback(() => {
    if (watchdog.current) {
      clearTimeout(watchdog.current);
      watchdog.current = null;
    }
    controller.current = null;
    inFlight.current = false;
    setPending(false);
  }, []);

  const begin = useCallback(() => {
    if (inFlight.current || cooling.current) return false;

    inFlight.current = true;
    setPending(true);

    controller.current = new AbortController();
    watchdog.current = setTimeout(() => {
      // Abort first, then release: the `fetch` rejects with a TimeoutError the
      // form turns into "that took too long", and there is no orphaned request
      // left to land after the button is live again.
      controller.current?.abort(
        new DOMException("Request timed out", "TimeoutError"),
      );
      end();
    }, AUTH_REQUEST_TIMEOUT_MS);

    return true;
  }, [end]);

  const hold = useCallback((seconds: number) => {
    if (seconds > 0) {
      cooling.current = true;
      setCooldown(Math.ceil(seconds));
    }
  }, []);

  const signal = useCallback(() => {
    // `begin()` always runs first, so the controller exists. The fallback keeps
    // this total rather than asserting — an unsignalled request is a worse
    // outcome than a request with a throwaway signal on it.
    return (controller.current ?? new AbortController()).signal;
  }, []);

  return {
    pending,
    cooldown,
    disabled: pending || cooldown > 0,
    begin,
    end,
    hold,
    signal,
  };
}

/**
 * The button's label while it is locked.
 *
 * Returns null when there is nothing to say, so a caller can keep its own
 * wording for the ordinary and pending states.
 */
export function cooldownLabel(cooldown: number): string | null {
  if (cooldown <= 0) return null;
  if (cooldown < 60) return `Try again in ${cooldown}s`;

  const minutes = Math.ceil(cooldown / 60);
  return `Try again in ${minutes} min`;
}
