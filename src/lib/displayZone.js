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

// "Pacific": a zone's name for a label.
export const zoneName = (zone) => DISPLAY_ZONES.find(([name]) => name === zone)?.[1] ?? zone;

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

// "Nov 10, 2026, 7:43 AM PST": when something was written. Spelled out rather
// than dateStyle/timeStyle, which can't name the zone.
export const WRITTEN = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
};

// An Intl.DateTimeFormat is slow to build, so one is kept per zone and options.
const formatters = new Map();

// A moment (ISO string or Date) on `zone`'s clock. `options` are
// Intl.DateTimeFormat's, so a caption can ask for `timeZoneName: 'short'`.
export function formatInZone(instant, zone, options) {
  const key = `${zone}|${JSON.stringify(options)}`;
  if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat('en-US', { timeZone: zone, ...options }));
  return formatters.get(key).format(new Date(instant));
}

// The wall clock of `instant` on `zone`, as a datetime-local input holds it:
// "2026-11-10T07:43".
export function toZoneInput(instant, zone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map(({ type, value }) => [type, value])
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

// The instant (ISO string) a datetime-local value means on `zone`'s clock,
// undefined for a blank one. The value is read as if it were UTC, then moved by
// how far the zone's clock read from it at that instant; a second pass settles
// the guess when the move crossed a daylight-time change.
export function fromZoneInput(value, zone) {
  if (!value) return undefined;
  const asUtc = Date.parse(`${value}:00Z`);
  const shift = (guess) => asUtc - (Date.parse(`${toZoneInput(guess, zone)}:00Z`) - guess);
  return new Date(shift(shift(asUtc))).toISOString();
}

// A trade's close on the display zone's clock, with the zone named: "Tue, Nov 10, 7:43 AM PST".
export const formatCloseTime = (closedAt, zone) =>
  formatInZone(closedAt, zone, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
