import { cloneElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TimeOfDay, { TimeTooltip } from '../TimeOfDay';

// jsdom gives ResponsiveContainer no size, so it draws nothing. Hand the chart
// a fixed one to check where things land.
vi.mock('recharts', async (importOriginal) => {
  const recharts = await importOriginal();
  return {
    ...recharts,
    ResponsiveContainer: ({ children }) => cloneElement(children, { width: 780, height: 300 }),
  };
});

const STARTS = [
  '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30',
  '13:00', '13:30', '14:00', '14:30', '15:00', '15:30',
];

// The route's timeOfDay: every half hour, with a row of figures for those that traded.
function buckets(filled = {}, outside = null) {
  const rows = STARTS.map((start) => {
    const [trades = 0, netPnl = 0, wins = 0] = filled[start] ?? [];
    return {
      start,
      trades,
      wins,
      netPnl,
      winRate: trades ? wins / trades : null,
      netExpectancy: trades ? netPnl / trades : null,
    };
  });
  return outside ? [...rows, { start: 'outside', winRate: null, netExpectancy: null, wins: 0, ...outside }] : rows;
}

describe('TimeOfDay', () => {
  it('sums up the session in words, best and worst half hour included', () => {
    render(<TimeOfDay buckets={buckets({ '10:00': [2, 40, 2], '11:30': [1, -25, 0], '15:30': [3, 0, 1] })} />);

    expect(screen.getByRole('heading', { name: 'Results by time of day' })).toBeInTheDocument();
    expect(
      screen.getByText('6 trades entered from 9:30 to 4:00 ET. Best half hour: 10:00, +$40.00. Worst: 11:30, -$25.00.')
    ).toBeInTheDocument();
  });

  it('leaves out a worst half hour with no loss, and says a single trade is one trade', () => {
    render(<TimeOfDay buckets={buckets({ '10:00': [1, 12, 1] })} />);

    expect(screen.getByText('1 trade entered from 9:30 to 4:00 ET. Best half hour: 10:00, +$12.00.')).toBeInTheDocument();
  });

  it('reports entries outside the session apart from the chart, so the bars keep their clock', () => {
    render(<TimeOfDay buckets={buckets({ '10:00': [1, 12, 1] }, { trades: 2, netPnl: 15 })} />);

    expect(screen.getByText(/Outside the session: 2 trades, \+\$15\.00\./)).toBeInTheDocument();
  });

  it('says so, without drawing empty bars, when every trade was entered outside the session', () => {
    render(<TimeOfDay buckets={buckets({}, { trades: 2, netPnl: 15 })} />);

    expect(
      screen.getByText('No trades entered during the session. Outside the session: 2 trades, +$15.00.')
    ).toBeInTheDocument();
    expect(screen.queryByText('No closed trades in this range.')).not.toBeInTheDocument();
  });

  it('says so when there are no closed trades, instead of drawing empty axes', () => {
    render(<TimeOfDay buckets={buckets()} />);

    expect(screen.getByText('No closed trades in this range.')).toBeInTheDocument();
  });

  it('shades the three entry windows to scale, a quarter hour wide for the first', () => {
    const { container } = render(<TimeOfDay buckets={buckets({ '10:00': [1, 12, 1] })} />);

    const areas = [...container.querySelectorAll('.recharts-reference-area-rect')].map((rect) => ({
      x: Number(rect.getAttribute('x')),
      width: Number(rect.getAttribute('width')),
    }));
    expect(areas).toHaveLength(3);
    const [open, midday, late] = areas;
    // 9:30-9:45, 11:00-14:00, and 14:45-15:00 on a 390-minute session: widths 15, 180, 15
    // minutes, and starts 0, 90, and 315 minutes in.
    expect(midday.width / open.width).toBeCloseTo(12, 1);
    expect(late.width / open.width).toBeCloseTo(1, 1);
    expect((midday.x - open.x) / open.width).toBeCloseTo(6, 1);
    expect((late.x - open.x) / open.width).toBeCloseTo(21, 1);
  });

  it('puts the shading on the same clock as the bars: the first window is the first half of the 9:30 slot', () => {
    const { container } = render(<TimeOfDay buckets={buckets({ '10:00': [1, 12, 1] })} />);

    // Slots share the plot width equally, so two neighboring ticks are one slot apart.
    const tick = (label) =>
      Number(
        [...container.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick-value')]
          .find((t) => t.textContent === label)
          .getAttribute('x')
      );
    const slot = tick('10:00') - tick('9:30');
    const open = container.querySelector('.recharts-reference-area-rect');

    // A tick sits at the middle of its slot, so the slot starts half a slot before it.
    expect(Number(open.getAttribute('x'))).toBeCloseTo(tick('9:30') - slot / 2, 1);
    expect(Number(open.getAttribute('width'))).toBeCloseTo(slot / 2, 1);
  });
});

describe('TimeTooltip', () => {
  const at = (row) => ({ active: true, payload: [{ payload: row }] });
  const rows = buckets({ '10:00': [2, 20, 1], '11:00': [1, -5, 0] });
  const row = (start) => rows.find((r) => r.start === start);

  it('leads with the half hour net P/L, then the trades, win rate, and average', () => {
    render(<TimeTooltip {...at(row('10:00'))} />);

    expect(screen.getByText('+$20.00')).toBeInTheDocument();
    expect(screen.getByText('10:00 to 10:30 ET')).toBeInTheDocument();
    expect(screen.getByText('2 trades · 50% win rate · +$10.00 per trade')).toBeInTheDocument();
    expect(screen.queryByText('Overlaps an entry window')).not.toBeInTheDocument();
  });

  it('says when the half hour overlaps an entry window', () => {
    render(<TimeTooltip {...at(row('11:00'))} />);

    expect(screen.getByText('Overlaps an entry window')).toBeInTheDocument();
  });

  it('says there were no trades in an empty half hour', () => {
    render(<TimeTooltip {...at(row('12:00'))} />);

    expect(screen.getByText('No trades')).toBeInTheDocument();
  });

  it('does not count a window that ends where the half hour begins', () => {
    render(<TimeTooltip {...at(row('15:00'))} />);

    expect(screen.queryByText('Overlaps an entry window')).not.toBeInTheDocument();
  });

  it('renders nothing while the pointer is off the chart', () => {
    const { container } = render(<TimeTooltip active={false} payload={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
