import { EMOTION_LABELS, MISTAKE_LABELS } from './journalEntry';

const REVIEW_DAYS = 7;

// The weekly review covers the seven days before now.
export function reviewWindowStart(now = new Date()) {
  return new Date(now.getTime() - REVIEW_DAYS * 24 * 60 * 60 * 1000);
}

// Dates are given in market time, so a note logged Tuesday evening in New York
// is reviewed as Tuesday, not as UTC's Wednesday.
const dayFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
});

// Status is derived from the timestamps, never stored.
const statusOf = (trade) => (trade.closedAt ? 'closed' : trade.openedAt ? 'open' : 'planned');

function describeTrade(trade) {
  const levels = [
    ['Planned entry', trade.plannedEntry],
    ['stop', trade.initialStop],
    ['target', trade.target],
    ['filled at', trade.entryPrice],
    ['exited at', trade.exitPrice],
  ]
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([label, value]) => `${label} ${value}`);

  const { mode, direction, quantity, symbol, assetClass } = trade;
  return `${mode} ${direction} ${quantity} ${symbol} ${assetClass}, ${statusOf(trade)}. ${levels.join(', ')}.`;
}

function formatEntry(entry) {
  const attributes = [
    `date="${dayFormat.format(entry.createdAt)}"`,
    `kind="${entry.kind}"`,
    entry.symbol && `symbol="${entry.symbol}"`,
  ].filter(Boolean);

  const lines = [
    entry.emotion && `Feeling: ${EMOTION_LABELS[entry.emotion] ?? entry.emotion}`,
    entry.mistakes.length > 0 &&
      `Mistakes: ${entry.mistakes.map((mistake) => MISTAKE_LABELS[mistake] ?? mistake).join(', ')}`,
    entry.trade && `Trade: ${describeTrade(entry.trade)}`,
    `Notes: ${entry.notes}`,
  ].filter(Boolean);

  return `<entry ${attributes.join(' ')}>\n${lines.join('\n')}\n</entry>`;
}

// The week's journal entries as text for Claude, oldest first so the review
// follows the week in order.
export function formatEntries(entries) {
  return [...entries]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map(formatEntry)
    .join('\n\n');
}
