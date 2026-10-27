'use client';

import { useSyncExternalStore } from 'react';
import { applyTheme, readTheme, saveTheme } from '@/lib/theme';

// The saved choice lives in localStorage. useSyncExternalStore reads it in the
// browser and uses 'system' on the server, and re-reads it when choose()
// tells its listeners the choice changed.
const listeners = new Set();
function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
const savedChoice = () => readTheme(localStorage);
const serverChoice = () => 'system';

// Light, dark, or whatever the system is set to. The page already looks
// right before this renders, because themeScript applied the saved choice.
export default function ThemePicker() {
  const choice = useSyncExternalStore(subscribe, savedChoice, serverChoice);

  function choose(next) {
    saveTheme(localStorage, next);
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
