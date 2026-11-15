import { underlyingAtEntry } from '@/lib/underlyingAtEntry';
import { fetchMinuteBars } from './minuteBars';

const MINUTE = 60_000;

// The end of the minute holding `openedAt`, so the bar the fill happened in is
// fetched too (the context snapshot's bars stop before it).
export const fillMinuteEnd = (openedAt) => new Date(Math.floor(openedAt.getTime() / MINUTE) * MINUTE + MINUTE);

// An option's entry and derived stop on the underlying, from Alpaca's minute
// bars (underlyingAtEntry). Server-only. A failed fetch throws.
export async function captureUnderlying(trade) {
  return underlyingAtEntry(trade, await fetchMinuteBars(trade.symbol, fillMinuteEnd(trade.openedAt)));
}
