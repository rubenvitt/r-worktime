"use client";

import { createContext, useContext } from "react";

interface ShortcutsContextValue {
  openShortcuts: () => void;
}

export const ShortcutsContext = createContext<ShortcutsContextValue>({
  openShortcuts: () => {},
});

export function useShortcutsDialog(): ShortcutsContextValue {
  return useContext(ShortcutsContext);
}
