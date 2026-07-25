import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { createElement } from 'react';
import { server } from './src/mocks/server';

// --- MSW lifecycle ---
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// --- jsdom shims for Recharts ---
// ResponsiveContainer measures its parent; jsdom reports 0x0, so charts
// render empty. Force a real size so chart content mounts. Written with
// createElement instead of JSX so this stays a plain .js setup file.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    ResponsiveContainer: ({ children }) =>
      createElement('div', { style: { width: 800, height: 400 } }, children),
  };
});

// Recharts also touches ResizeObserver, which jsdom lacks.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};