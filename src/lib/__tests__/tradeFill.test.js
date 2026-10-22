import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { parseTradeEntry, parseTradeExit } from '../tradeFill';

const now = new Date('2026-10-22T20:00:00Z');
const openTrade = { openedAt: new Date('2026-10-20T14:00:00Z') };

const errorsOf = (result) => z.flattenError(result.error).fieldErrors;

describe('parseTradeEntry', () => {
  it('accepts a fill price and time, turning the time into a Date', () => {
    const result = parseTradeEntry({ entryPrice: 50.25, openedAt: '2026-10-20T14:00:00.000Z' }, { now });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ entryPrice: 50.25, openedAt: new Date('2026-10-20T14:00:00Z') });
  });

  it('requires a positive price', () => {
    const result = parseTradeEntry({ entryPrice: 0, openedAt: '2026-10-20T14:00:00Z' }, { now });

    expect(errorsOf(result)).toHaveProperty('entryPrice');
  });

  it('requires a valid time', () => {
    const result = parseTradeEntry({ entryPrice: 50, openedAt: 'yesterday' }, { now });

    expect(errorsOf(result)).toHaveProperty('openedAt');
  });

  it('rejects a time in the future', () => {
    const result = parseTradeEntry({ entryPrice: 50, openedAt: '2026-10-23T14:00:00Z' }, { now });

    expect(errorsOf(result).openedAt).toEqual(["The fill time can't be in the future"]);
  });

  it("allows a few minutes of difference between the browser's clock and the server's", () => {
    const result = parseTradeEntry({ entryPrice: 50, openedAt: '2026-10-22T20:02:00Z' }, { now });

    expect(result.success).toBe(true);
  });
});

describe('parseTradeExit', () => {
  const exit = {
    exitPrice: 54,
    closedAt: '2026-10-21T15:30:00.000Z',
    exitReason: 'target',
    exitedPerPlan: true,
  };

  it('accepts an exit, with fees defaulting to zero', () => {
    const result = parseTradeExit(exit, openTrade, { now });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ ...exit, closedAt: new Date('2026-10-21T15:30:00Z'), fees: 0 });
  });

  it('keeps fees when given', () => {
    expect(parseTradeExit({ ...exit, fees: 1.3 }, openTrade, { now }).data.fees).toBe(1.3);
  });

  it('rejects negative fees', () => {
    expect(errorsOf(parseTradeExit({ ...exit, fees: -1 }, openTrade, { now }))).toHaveProperty('fees');
  });

  it('requires a reason from the fixed list', () => {
    expect(errorsOf(parseTradeExit({ ...exit, exitReason: 'felt like it' }, openTrade, { now }))).toHaveProperty(
      'exitReason'
    );
  });

  it('requires saying whether the exit followed the plan', () => {
    const unanswered = { ...exit, exitedPerPlan: undefined };

    expect(errorsOf(parseTradeExit(unanswered, openTrade, { now }))).toHaveProperty('exitedPerPlan');
  });

  it('rejects an exit before the entry', () => {
    const result = parseTradeExit({ ...exit, closedAt: '2026-10-20T13:59:00Z' }, openTrade, { now });

    expect(errorsOf(result).closedAt).toEqual(["The exit can't be before the entry"]);
  });

  it('rejects an exit in the future', () => {
    const result = parseTradeExit({ ...exit, closedAt: '2026-10-23T15:30:00Z' }, openTrade, { now });

    expect(errorsOf(result).closedAt).toEqual(["The exit time can't be in the future"]);
  });
});
