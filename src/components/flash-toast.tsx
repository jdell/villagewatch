"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";

/**
 * Fires one toast when a Server Component renders it, then never again.
 *
 * The case this exists for is a server action that ends in `redirect()`: the
 * action cannot return a state to `useActionState`, because it never returns at
 * all, so the confirmation has to travel in the URL and be announced on the
 * page that lands. `/coordinator-apply` → `/settings?applied=1` is the first.
 *
 * The ref guard is not defensive tidiness. React's development Strict Mode
 * mounts every component twice, and without it the resident is thanked for
 * their application two seconds apart, in production-looking UI, in dev only —
 * the sort of thing that gets debugged as a double submit.
 */
export function FlashToast({
  message,
  variant = "success",
}: {
  message: string;
  variant?: "success" | "error" | "info";
}) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;

    if (variant === "error") toast.error(message);
    else if (variant === "info") toast(message);
    else toast.success(message);
  }, [message, variant]);

  return null;
}
