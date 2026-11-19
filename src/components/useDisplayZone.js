'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_ZONE, DISPLAY_ZONE_KEY, readDisplayZone, saveDisplayZone } from '@/lib/displayZone';

// localStorage itself can throw, in a sandboxed frame for example.
function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

// Same shape as ThemePicker: the saved zone is read from localStorage in the
// browser and is the default on the server, and listeners hear about a change
// made here (setDisplayZone) or in another tab (a storage event).
const listeners = new Set();
// A zone storage refused still applies to this page.
let unsaved = null;

const snapshot = () => unsaved ?? (storage() ? readDisplayZone(storage()) : DEFAULT_ZONE);
const serverSnapshot = () => DEFAULT_ZONE;

function subscribe(listener) {
  listeners.add(listener);
  const fromOtherTab = (event) => {
    if (event.key === DISPLAY_ZONE_KEY || event.key === null) listener();
  };
  window.addEventListener('storage', fromOtherTab);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', fromOtherTab);
  };
}

export function setDisplayZone(zone) {
  const store = storage();
  unsaved = store !== null && saveDisplayZone(store, zone) ? null : zone;
  for (const listener of listeners) listener();
}

// The zone to display times in.
export default function useDisplayZone() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
