import { vi } from 'vitest';

// Silence logError and read back what it wrote, one parsed object per line.
export function captureErrorLogs() {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  consoleError.mockClear();
  return () => consoleError.mock.calls.map(([line]) => JSON.parse(line));
}
