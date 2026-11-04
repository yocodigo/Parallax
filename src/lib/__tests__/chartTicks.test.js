import { describe, expect, it } from 'vitest';
import { monthColumns, outcomeColumns, outcomeTicks, timeTicks, valueTicks } from '../chartTicks';

describe('timeTicks', () => {
  it('marks the first point of each New York day over a short span', () => {
    const times = [
      '2026-03-10T14:00:00Z',
      '2026-03-10T19:00:00Z',
      // 01:00Z on March 12 is still March 11 in New York.
      '2026-03-12T01:00:00Z',
      '2026-03-12T15:00:00Z',
    ];

    expect(timeTicks(times)).toEqual([
      { index: 0, label: 'Mar 10' },
      { index: 2, label: 'Mar 11' },
      { index: 3, label: 'Mar 12' },
    ]);
  });

  it('marks the first point of each New York month over a long span', () => {
    const times = [
      '2026-01-05T15:00:00Z',
      '2026-01-20T15:00:00Z',
      '2026-02-03T15:00:00Z',
      // 03:00Z on April 1 is still March 31 in New York.
      '2026-04-01T03:00:00Z',
      '2026-04-02T15:00:00Z',
    ];

    expect(timeTicks(times)).toEqual([
      { index: 0, label: 'Jan' },
      { index: 2, label: 'Feb' },
      { index: 3, label: 'Mar' },
      { index: 4, label: 'Apr' },
    ]);
  });

  it('names the year on the first month and each January when the span crosses a year', () => {
    const times = ['2025-11-03T15:00:00Z', '2025-12-01T15:00:00Z', '2026-01-05T15:00:00Z'];

    expect(timeTicks(times).map((t) => t.label)).toEqual(['Nov 2025', 'Dec', 'Jan 2026']);
  });

  it('returns no ticks for no points', () => {
    expect(timeTicks([])).toEqual([]);
  });
});

describe('valueTicks', () => {
  it('spans the values and zero in round steps', () => {
    expect(valueTicks(-94.5, 835)).toEqual([-200, 0, 200, 400, 600, 800, 1000]);
  });

  it('takes the smallest round step that keeps to seven intervals', () => {
    expect(valueTicks(-183.9, 101.5)).toEqual([-200, -150, -100, -50, 0, 50, 100, 150]);
  });

  it('starts at zero when every value is above it', () => {
    expect(valueTicks(18.7, 30)).toEqual([0, 5, 10, 15, 20, 25, 30]);
  });

  it('never steps by less than a dollar', () => {
    expect(valueTicks(0, 0)).toEqual([0, 1]);
    expect(valueTicks(-0.4, 0.2)).toEqual([-1, 0, 1]);
  });

  it('keeps to whole numbers for counts, skipping the 2.5 step', () => {
    expect(valueTicks(0, 15)).toEqual([0, 2.5, 5, 7.5, 10, 12.5, 15]);
    expect(valueTicks(0, 15, { whole: true })).toEqual([0, 5, 10, 15]);
    expect(valueTicks(-3, 12, { whole: true })).toEqual([-5, 0, 5, 10, 15]);
  });

  it('still uses the 25 step once it is whole', () => {
    expect(valueTicks(0, 150, { whole: true })).toEqual([0, 25, 50, 75, 100, 125, 150]);
  });
});

describe('monthColumns', () => {
  it('gives every calendar month from the first to the last a column, empty where nothing closed', () => {
    const columns = monthColumns([
      { month: '2026-03', netPnl: 30 },
      { month: '2026-05', netPnl: -10 },
    ]);

    expect(columns).toEqual([
      { month: '2026-03', label: 'Mar', year: null, netPnl: 30 },
      { month: '2026-04', label: 'Apr', year: null, netPnl: null },
      { month: '2026-05', label: 'May', year: null, netPnl: -10 },
    ]);
  });

  it('gives the year, set apart from the month, to the first label and each January when the months cross a year', () => {
    const columns = monthColumns([
      { month: '2025-11', netPnl: 1 },
      { month: '2026-02', netPnl: 2 },
    ]);

    expect(columns.map((c) => [c.label, c.year])).toEqual([
      ['Nov', 2025],
      ['Dec', null],
      ['Jan', 2026],
      ['Feb', null],
    ]);
  });

  it('labels only the quarter starts past twelve months, so the year boundary is never dropped', () => {
    const columns = monthColumns([
      { month: '2025-06', netPnl: 1 },
      { month: '2026-10', netPnl: 2 },
    ]);

    expect(columns.filter((c) => c.label).map((c) => [c.label, c.year])).toEqual([
      ['Jul', 2025],
      ['Oct', null],
      ['Jan', 2026],
      ['Apr', null],
      ['Jul', null],
      ['Oct', null],
    ]);
  });

  it('labels only the Januaries past three years', () => {
    const columns = monthColumns([
      { month: '2023-03', netPnl: 1 },
      { month: '2026-04', netPnl: 2 },
    ]);

    expect(columns.filter((c) => c.label).map((c) => [c.label, c.year])).toEqual([
      ['Jan', 2024],
      ['Jan', 2025],
      ['Jan', 2026],
    ]);
  });

  it('returns no columns for no months', () => {
    expect(monthColumns([])).toEqual([]);
  });
});

describe('outcomeColumns', () => {
  it('turns each month\'s losses into a negative count to hang below zero, keeping an empty month empty', () => {
    const months = [
      { month: '2026-01', wins: 5, losses: 3, scratches: 1, trades: 9 },
      { month: '2026-03', wins: 2, losses: 0, scratches: 0, trades: 2 },
    ];

    expect(outcomeColumns(months).map((c) => [c.month, c.wins, c.lossesBelow])).toEqual([
      ['2026-01', 5, -3],
      ['2026-02', undefined, null],
      ['2026-03', 2, 0],
    ]);
  });
});

describe('outcomeTicks', () => {
  it('runs from the most losses in a month to the tallest stack of wins and scratches', () => {
    const months = [
      { wins: 9, losses: 2, scratches: 3 },
      { wins: 4, losses: 6, scratches: 0 },
    ];

    expect(outcomeTicks(months)).toEqual([-10, -5, 0, 5, 10, 15]);
  });

  it('stays in whole trades', () => {
    expect(outcomeTicks([{ wins: 15, losses: 0, scratches: 0 }])).toEqual([0, 5, 10, 15]);
  });
});
