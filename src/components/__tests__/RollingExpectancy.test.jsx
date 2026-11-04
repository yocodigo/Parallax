import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import RollingExpectancy, { RollingTooltip } from '../RollingExpectancy';

const points = [
  { closedAt: '2026-03-21T20:00:00.000Z', expectancy: 9, netExpectancy: 8 },
  { closedAt: '2026-04-13T20:00:00.000Z', expectancy: 10, netExpectancy: 9 },
];

describe('RollingExpectancy', () => {
  it('sums up the trend in words, so no value needs the chart to be read', () => {
    render(<RollingExpectancy points={points} />);

    expect(screen.getByRole('heading', { name: 'Expectancy, last 20 trades' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Net expectancy per trade ended at +$9.00 (+$10.00 gross), after 2 windows, between a low of +$8.00 and a high of +$9.00.'
      )
    ).toBeInTheDocument();
  });

  it('says when it will appear, since it needs a full window of closed trades', () => {
    render(<RollingExpectancy points={[]} />);

    expect(screen.getByText('Shows once 20 trades have closed in this range.')).toBeInTheDocument();
  });

  it('describes a single window without a range', () => {
    render(<RollingExpectancy points={points.slice(0, 1)} />);

    expect(
      screen.getByText('Net expectancy per trade is +$8.00 (+$9.00 gross), from one window of 20 trades.')
    ).toBeInTheDocument();
  });
});

describe('RollingTooltip', () => {
  const at = (point, index) => ({ active: true, payload: [{ payload: { ...point, index } }] });

  it('leads with net expectancy, then gross, and the trade the window ends on', () => {
    render(<RollingTooltip {...at(points[1], 1)} />);

    expect(screen.getByText('+$9.00 net')).toBeInTheDocument();
    expect(screen.getByText('+$10.00 gross')).toBeInTheDocument();
    expect(screen.getByText('Through trade 21 · Mon, Apr 13, 4:00 PM ET')).toBeInTheDocument();
  });

  it('renders nothing while the pointer is off the chart', () => {
    const { container } = render(<RollingTooltip active={false} payload={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
