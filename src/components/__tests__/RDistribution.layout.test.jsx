import { cloneElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import RDistribution from '../RDistribution';

// jsdom gives ResponsiveContainer no size, so it draws nothing. Hand the chart
// a fixed one to read its axis labels.
vi.mock('recharts', async (importOriginal) => {
  const recharts = await importOriginal();
  return { ...recharts, ResponsiveContainer: ({ children }) => cloneElement(children, { width: 600, height: 256 }) };
});

describe('RDistribution layout', () => {
  it('labels each drawn tick with its own band when only some are drawn', () => {
    // Twelve bins from -6R to +6R: more than eight, so every other one is labelled.
    const bins = Array.from({ length: 12 }, (_, k) => ({ from: k - 6, to: k - 5, count: 1 }));
    render(<RDistribution distribution={{ bins, measured: 12, total: 12 }} />);

    // Bins 0, 2, 4, ... are drawn: -6R, -4R, -2R, ...
    expect(screen.getByText('-4R to -3R')).toBeInTheDocument();
    expect(screen.queryByText('-5R to -4R')).not.toBeInTheDocument();
  });
});
