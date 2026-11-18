import { cloneElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import OptionExcursions from '../OptionExcursions';

// jsdom gives ResponsiveContainer no size, so it draws nothing. Hand the chart
// a fixed one to read its axis labels.
vi.mock('recharts', async (importOriginal) => {
  const recharts = await importOriginal();
  return { ...recharts, ResponsiveContainer: ({ children }) => cloneElement(children, { width: 600, height: 224 }) };
});

const p = { p50: 0.1, p75: 0.1, p90: 0.1 };
const bands = Array.from({ length: 10 }, (_, k) => ({ from: k * 0.05, to: k === 9 ? null : (k + 1) * 0.05, trades: k % 3 }));
const summary = {
  winners: 9,
  premium: { trades: 9, excluded: { partialCoverage: 0, edgeMinutesOnly: 0, delta: 0, none: 0 }, bands, percentiles: p },
  underlying: { excluded: { edgeMinutesOnly: 0 }, r: { plan: { trades: 0, percentiles: p }, derived: { trades: 0, percentiles: p } }, points: [] },
};
const body = {
  heat: { rows: [], summary, summaryAll: summary },
  afterExit: { rows: [], summary: { trades: 0, points: [], r: { plan: { trades: 0, percentiles: p }, derived: { trades: 0, percentiles: p } }, t1: { judged: 0, reached: 0 } } },
  timing: {
    rows: [],
    untimed: 0,
    groups: ['early', 'on', 'late', 'none'].map((timing) => ({
      timing,
      trades: 0,
      netPnl: 0,
      heatPoints: [],
      heatR: { plan: { trades: 0, percentiles: p }, derived: { trades: 0, percentiles: p } },
    })),
  },
};

describe('OptionExcursions layout', () => {
  it('labels each drawn tick with its own band, every other band drawn', async () => {
    server.use(http.get('*/api/insights/option-excursions', () => HttpResponse.json(body)));
    render(
      <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
        <OptionExcursions mode="live" year="2026" />
      </SWRConfig>
    );

    await userEvent.click(screen.getByRole('button', { name: 'Measure heat and after the exit' }));

    // Bands 0, 2, 4, 6, 8 are drawn: 0%-5%, 10%-15%, and so on. A label taken by
    // the drawn tick's position would read 5%-10% under the 10%-15% bar.
    expect(await screen.findByText('10%–15%')).toBeInTheDocument();
    expect(screen.getByText('40%–45%')).toBeInTheDocument();
    expect(screen.queryByText('5%–10%')).not.toBeInTheDocument();
  });
});
