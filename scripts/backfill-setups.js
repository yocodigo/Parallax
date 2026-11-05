// Adds `setups` (the four-touch break the trade went with, for its grade) to
// the context snapshots saved before version 2, in the journal's database
// (DATABASE_URL). Run with `npm run db:backfill-setups`. It fetches Alpaca's
// minute bars (keys from .env.local) once per symbol and New York day, a
// little apart to stay under the rate limit. A failed fetch is reported and
// its trades left for the next run; the rest of each snapshot is untouched.
// Runs under tsx like seed-demo.js.
import { loadEnvConfig } from '@next/env';
import { drizzle } from 'drizzle-orm/node-postgres';
import { addContextSetups, listContextsWithoutSetups } from '../src/db/contexts';
import * as schema from '../src/db/schema';
import { setupsAt } from '../src/lib/context/buildContext';
import { fetchMinuteBars } from '../src/server/minuteBars';

// Alpaca's free plan allows 200 requests a minute.
const PAUSE_MS = 350;

const nyDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' });
const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

// The trades in groups that one fetch covers: the same symbol on the same New
// York day. Each group's bars run to its latest fill; fourTouchAt cuts them
// at each trade's own fill.
function bySymbolAndDay(list) {
  const groups = new Map();
  for (const trade of list) {
    const key = `${trade.symbol} ${nyDate.format(trade.openedAt)}`;
    groups.set(key, [...(groups.get(key) ?? []), trade]);
  }
  return groups;
}

async function main() {
  loadEnvConfig(process.cwd());
  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL (in .env.local) to the journal database.');
    return 1;
  }

  const db = drizzle(process.env.DATABASE_URL, { schema });
  try {
    const list = await listContextsWithoutSetups(db);
    console.log(`${list.length} snapshots without setups.`);
    let added = 0;
    let failed = 0;

    // Capture fetches stock bars only, so a crypto snapshot gets no setups.
    for (const trade of list.filter((t) => t.assetClass === 'crypto')) {
      await addContextSetups(db, trade.id, null);
      added += 1;
    }

    for (const [key, group] of bySymbolAndDay(list.filter((t) => t.assetClass !== 'crypto'))) {
      const end = group.at(-1).openedAt;
      try {
        const bars = await fetchMinuteBars(group[0].symbol, end);
        for (const trade of group) {
          await addContextSetups(db, trade.id, setupsAt(trade, bars));
          added += 1;
        }
      } catch (error) {
        console.error(`${key}: ${error.message}`);
        failed += group.length;
      }
      await pause();
    }

    console.log(`Added setups to ${added}.${failed ? ` ${failed} left for the next run.` : ''}`);
    return failed ? 1 : 0;
  } finally {
    await db.$client.end();
  }
}

main().then((code) => {
  process.exitCode = code;
});
