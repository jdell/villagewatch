"use client";

import { createContext, useContext } from "react";
import {
  DEFAULT_UI_VERSION,
  type UiVersion,
} from "@/lib/ui-version";

/**
 * The resolved UI version, for Client Components.
 *
 * `(app)/layout.tsx` resolves it once per request — the village's setting, then
 * the resident's session override — and provides it here, so any component in
 * the authenticated app can branch on it without a prop threaded through every
 * level. A Server Component reads `getEffectiveUiVersion()` instead, which is
 * the same resolution and the same per-request cache.
 *
 * `village` rides along with `effective` because the sidebar link has to know
 * whether the resident is looking at their village's choice or overriding it.
 */
export type UiVersionState = { village: UiVersion; effective: UiVersion };

const UiVersionContext = createContext<UiVersionState>({
  village: DEFAULT_UI_VERSION,
  effective: DEFAULT_UI_VERSION,
});

export function UiVersionProvider({
  value,
  children,
}: {
  value: UiVersionState;
  children: React.ReactNode;
}) {
  return (
    <UiVersionContext.Provider value={value}>{children}</UiVersionContext.Provider>
  );
}

export function useUiVersion(): UiVersionState {
  return useContext(UiVersionContext);
}
