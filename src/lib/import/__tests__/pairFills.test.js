import { describe, expect, it } from 'vitest';
import { pairFills } from '../pairFills';

const CONTRACT = {
  symbol: 'QQQ',
  assetClass: 'option',
  optionType: 'call',
  strike: 600,
  expiration: '2026-10-23',
  multiplier: 100,
};

let nextRef = 1;
// A fill of the QQQ 600 call at `time` (UTC, on Oct 23, 2026), $0.66 a contract in fees.
const fill = (side, quantity, price, time, contract = CONTRACT) => ({
  ref: String(nextRef++),
  executedAt: new Date(`2026-10-23T${time}Z`),
  side,
  quantity,
  price,
  fees: 0.66 * quantity,
  ...contract,
});

describe('pairFills', () => {
  it('pairs a buy and the sale that closes it into one closed trade', () => {
    const buy = fill('buy', 2, 2.1, '16:31:05');
    const sell = fill('sell', 2, 2.5, '16:40:12');

    const { trades, unpaired } = pairFills([buy, sell]);

    expect(trades).toEqual([
      {
        ...CONTRACT,
        direction: 'long',
        quantity: 2,
        entryPrice: 2.1,
        openedAt: buy.executedAt,
        exitPrice: 2.5,
        closedAt: sell.executedAt,
        fees: 2.64,
        refs: [buy.ref, sell.ref],
        fillCount: 2,
      },
    ]);
    expect(unpaired).toEqual([]);
  });

  it('starts a new trade each time the position returns to flat', () => {
    const { trades } = pairFills([
      fill('buy', 1, 1.3, '18:41:05'),
      fill('sell', 1, 1.17, '18:42:53'),
      fill('buy', 1, 1.34, '18:47:53'),
      fill('sell', 1, 1.04, '18:49:55'),
    ]);

    expect(trades.map((t) => [t.entryPrice, t.exitPrice])).toEqual([
      [1.3, 1.17],
      [1.34, 1.04],
    ]);
  });

  it('keeps contracts apart, even when their trades overlap', () => {
    const put = { ...CONTRACT, optionType: 'put', strike: 590 };

    const { trades } = pairFills([
      fill('buy', 1, 2, '16:00:00'),
      fill('buy', 1, 1, '16:01:00', put),
      fill('sell', 1, 3, '16:02:00'),
      fill('sell', 1, 0.5, '16:03:00', put),
    ]);

    expect(trades.map((t) => [t.optionType, t.entryPrice, t.exitPrice])).toEqual([
      ['call', 2, 3],
      ['put', 1, 0.5],
    ]);
  });

  it('averages the prices of a trade scaled into and out of, weighted by quantity', () => {
    const { trades } = pairFills([
      fill('buy', 1, 2, '16:00:00'),
      fill('buy', 3, 2.4, '16:05:00'),
      fill('sell', 2, 3, '16:10:00'),
      fill('sell', 2, 2, '16:20:00'),
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({ quantity: 4, entryPrice: 2.3, exitPrice: 2.5, fees: 5.28, fillCount: 4 });
    expect(trades[0].closedAt).toEqual(new Date('2026-10-23T16:20:00Z'));
  });

  it('orders fills by time, whatever order they come in', () => {
    const { trades } = pairFills([fill('sell', 1, 2.5, '16:40:00'), fill('buy', 1, 2.1, '16:30:00')]);

    expect(trades[0]).toMatchObject({ entryPrice: 2.1, exitPrice: 2.5 });
  });

  it('leaves a position still held at the end as an open trade', () => {
    const { trades } = pairFills([fill('buy', 1, 2.1, '16:30:00')]);

    expect(trades[0]).toMatchObject({ entryPrice: 2.1, exitPrice: null, closedAt: null, fillCount: 1 });
  });

  it('lists a sale that closes a position bought before the statement', () => {
    const sell = fill('sell', 1, 2.5, '16:40:00');

    const { trades, unpaired } = pairFills([sell]);

    expect(trades).toEqual([]);
    expect(unpaired).toEqual([{ fills: [sell], reason: 'Closes a position opened before this statement' }]);
  });

  it('lists a position partly closed by the end, since its exit is not known yet', () => {
    const fills = [fill('buy', 2, 2, '16:00:00'), fill('sell', 1, 2.5, '16:10:00')];

    const { trades, unpaired } = pairFills(fills);

    expect(trades).toEqual([]);
    expect(unpaired).toEqual([{ fills, reason: 'Partly closed by the end of this statement' }]);
  });

  it('lists a sale of more than is held, with the buys before it', () => {
    const buy = fill('buy', 1, 2, '16:00:00');
    const sell = fill('sell', 2, 2.5, '16:10:00');

    const { trades, unpaired } = pairFills([buy, sell]);

    expect(trades).toEqual([]);
    expect(unpaired).toEqual([{ fills: [buy, sell], reason: 'Sells more than was bought in this statement' }]);
  });
});
