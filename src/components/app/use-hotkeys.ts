"use client";

import { useEffect, useRef } from "react";

// Ein globaler Listener für alle registrierten Kürzel. Der Präfix einer
// Sequenz („g“) ist geteilt, damit „g t“ nicht zusätzlich „t“ auslöst.

type Bindings = Record<string, () => void>;

const SEQUENCE_TIMEOUT_MS = 1000;
const registry = new Set<{ current: Bindings }>();
let pendingPrefix: string | null = null;
let pendingAt = 0;
let listening = false;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return Boolean(
    target.closest(
      "input, textarea, select, [contenteditable]:not([contenteditable=false])",
    ),
  );
}

function findBinding(combo: string): (() => void) | undefined {
  // Zuletzt registrierte Bindungen gewinnen (Seite vor Shell)
  const sets = Array.from(registry).reverse();
  for (const set of sets) {
    const handler = set.current[combo];
    if (handler) return handler;
  }
  return undefined;
}

function isPrefix(key: string): boolean {
  for (const set of registry) {
    for (const combo of Object.keys(set.current)) {
      if (combo.startsWith(`${key} `)) return true;
    }
  }
  return false;
}

function onKeyDown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return;
  // Cmd+[ bleibt „Zurück“ im Browser; AltGr (Strg+Alt) und Option erzeugen auf
  // deutschen Tastaturen erst „[“ und „]“, deshalb nur echte Kürzel ignorieren
  if (event.metaKey) return;
  if (event.ctrlKey && !event.altKey) return;
  if (event.altKey && /^[a-z]$/i.test(event.key)) return;
  if (isEditableTarget(event.target)) return;
  if (document.querySelector("[role=dialog], [role=alertdialog]")) return;

  const key = event.key;
  if (key === "Shift" || key === "Escape") return;

  const now = Date.now();
  if (pendingPrefix && now - pendingAt <= SEQUENCE_TIMEOUT_MS) {
    const combo = `${pendingPrefix} ${key}`;
    pendingPrefix = null;
    const handler = findBinding(combo);
    if (handler) {
      event.preventDefault();
      handler();
    }
    // Mit offenem Präfix nie auf Einzeltasten zurückfallen
    return;
  }
  pendingPrefix = null;

  if (isPrefix(key)) {
    pendingPrefix = key;
    pendingAt = now;
    return;
  }

  const handler = findBinding(key);
  if (handler) {
    event.preventDefault();
    handler();
  }
}

/**
 * Tastenkürzel registrieren. Schlüssel: "g h", "?", "[", "]", "t" …
 * Sequenzen mit Leerzeichen, 1 s Timeout. Ignoriert in Eingabefeldern und
 * solange ein Dialog offen ist.
 */
export function useHotkeys(
  bindings: Record<string, () => void>,
  options?: { enabled?: boolean },
): void {
  const ref = useRef<Bindings>(bindings);
  ref.current = bindings;
  const enabled = options?.enabled ?? true;

  useEffect(() => {
    if (!enabled) return;
    const entry = ref;
    registry.add(entry);
    if (!listening) {
      window.addEventListener("keydown", onKeyDown);
      listening = true;
    }
    return () => {
      registry.delete(entry);
      if (registry.size === 0 && listening) {
        window.removeEventListener("keydown", onKeyDown);
        listening = false;
      }
    };
  }, [enabled]);
}
