'use client';

import { DISPLAY_ZONES } from '@/lib/displayZone';
import useDisplayZone, { setDisplayZone } from './useDisplayZone';

// Which clock times are shown on. Sessions and windows stay New York time.
export default function DisplayZonePicker() {
  const zone = useDisplayZone();

  return (
    <label className="flex items-center gap-2 text-gray-500">
      Times
      <select
        value={zone}
        onChange={(e) => setDisplayZone(e.target.value)}
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800"
      >
        {DISPLAY_ZONES.map(([name, label]) => (
          <option key={name} value={name}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
