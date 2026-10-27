'use client';

import { useState, useSyncExternalStore } from 'react';
import { applyTheme, readTheme, saveTheme, THEME_KEY } from '@/lib/theme';

// localStorage itself can throw, in a sandboxed frame for example.
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// The saved choice lives in localStorage. useSyncExternalStore reads it in the
// browser and uses 'system' on the server, and re-reads it when choose() tells
// its listeners the choice changed, or when another tab changes it.
const listeners = new Set();
const savedChoice = () => (storage() ? readTheme(storage()) : 'system');
const serverChoice = () => 'system';

function subscribe(listener) {
  listeners.add(listener);
  // Browsers send storage events only to the other tabs, never the one that
  // made the change. A null key means a tab cleared all of storage.
  const fromOtherTab = (event) => {
    if (event.key !== THEME_KEY && event.key !== null) return;
    applyTheme(document.documentElement, savedChoice());
    listener();
  };
  window.addEventListener('storage', fromOtherTab);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', fromOtherTab);
  };
}

// Light, dark, or whatever the system is set to. The page already looks
// right before this renders, because themeScript applied the saved choice.
export default function ThemePicker() {
  const saved = useSyncExternalStore(subscribe, savedChoice, serverChoice);
  // A choice storage couldn't keep: it still applies to this page. Null means
  // storage holds the choice. (Once set, it also outlasts other tabs' choices,
  // which can't be saved either while storage refuses writes.)
  const [unsaved, setUnsaved] = useState(null);
  const choice = unsaved ?? saved;

  function choose(next) {
    const store = storage();
    const stored = store !== null && saveTheme(store, next);
    setUnsaved(stored ? null : next);
    applyTheme(document.documentElement, next);
    for (const listener of listeners) listener();
  }

  return (
    <label className="flex items-center gap-2 text-gray-500">
      Theme
      <select
        value={choice}
        onChange={(e) => choose(e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
