// Adds `setups` (the four-touch break the trade went with, for its grade) to
// the context snapshots saved before version 2, in the journal's database
// (DATABASE_URL). Run with `npm run db:backfill-setups`. It fetches Alpaca's
// minute bars (keys from .env.local) once per symbol and New York day, a
// little apart to stay under the rate limit. A failed fetch is reported and
// its trades left for the next run; the rest of each snapshot is untouched.
// It sees the whole session, so a stock filled after 17:30 New York, whose
// capture reached back 8 hours and missed the open, can get a line capture
// wouldn't have found.
// Runs under tsx like seed-demo.js.
import { loadEnvConfig } from '@next/env';
import { drizzle } from 'drizzle-orm/node-postgres';
import { addContextSetups, listContextsWithoutSetups } from '../src/db/contexts';
import * as schema from '../src/db/schema';
import { backfillFetches } from '../src/lib/context/backfill';
import { setupsAt } from '../src/lib/context/buildContext';
import { fetchMinuteBars } from '../src/server/minuteBars';

// Alpaca's free plan allows 200 requests a minute.
const PAUSE_MS = 350;

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

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

    const { withoutBars, fetches } = backfillFetches(list);
    for (const trade of withoutBars) {
      await addContextSetups(db, trade.id, null);
      added += 1;
    }

    for (const { symbol, end, trades } of fetches) {
      let done = 0;
      try {
        const bars = await fetchMinuteBars(symbol, end);
        for (const trade of trades) {
          await addContextSetups(db, trade.id, setupsAt(trade, bars));
          done += 1;
        }
      } catch (error) {
        console.error(`${symbol} to ${end.toISOString()}: ${error.message}`);
        failed += trades.length - done;
      }
      added += done;
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
