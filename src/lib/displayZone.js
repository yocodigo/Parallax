// The zone times are displayed in (rules-v3 step 7). The code keeps New York
// time for sessions, windows, and month boundaries; this only changes how a
// moment is shown to the trader, who reads the clock in Pacific. It is a
// browser setting, like the theme, so the server's text stays New York time.

export const DISPLAY_ZONES = [
  ['America/Los_Angeles', 'Pacific'],
  ['America/Denver', 'Mountain'],
  ['America/Chicago', 'Central'],
  ['America/New_York', 'Eastern'],
];

export const DEFAULT_ZONE = 'America/Los_Angeles';
export const DISPLAY_ZONE_KEY = 'displayZone';

// The saved zone, or the default. Storage can be blocked, so reads may throw.
export function readDisplayZone(storage) {
  try {
    const zone = storage.getItem(DISPLAY_ZONE_KEY);
    return DISPLAY_ZONES.some(([name]) => name === zone) ? zone : DEFAULT_ZONE;
  } catch {
    return DEFAULT_ZONE;
  }
}

// Saves the zone, returning false when storage refused it.
export function saveDisplayZone(storage, zone) {
  try {
    storage.setItem(DISPLAY_ZONE_KEY, zone);
    return true;
  } catch {
    return false;
  }
}

const formatters = new Map();

// A moment (ISO string or Date) on `zone`'s clock. `options` are
// Intl.DateTimeFormat's, so a caption can ask for `timeZoneName: 'short'`.
export function formatInZone(instant, zone, options) {
  const key = `${zone}|${JSON.stringify(options)}`;
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat('en-US', { timeZone: zone, ...options }));
  return formatters.get(key).format(new Date(instant));
}
