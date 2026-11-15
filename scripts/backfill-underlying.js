// Records `underlying_entry`, and a derived `underlying_stop` where the
// band-cross setup fired, for entered options that have no underlying entry
// yet, in the journal's database (DATABASE_URL). Run with
// `npm run db:backfill-underlying`. It fetches Alpaca's minute bars (keys from
// .env.local) once per symbol and New York day, through the end of the latest
// fill's minute, a little apart to stay under the rate limit. A plan's own stop
// is never replaced. A failed fetch, or a fill with no bar on the feed, is
// reported and left for the next run.
// Runs under tsx like seed-demo.js.
import { loadEnvConfig } from '@next/env';
import { drizzle } from 'drizzle-orm/node-postgres';
import { listOptionsWithoutUnderlying, saveUnderlying } from '../src/db/trades';
import * as schema from '../src/db/schema';
import { backfillFetches } from '../src/lib/context/backfill';
import { underlyingAtEntry } from '../src/lib/underlyingAtEntry';
import { fetchMinuteBars } from '../src/server/minuteBars';
import { fillMinuteEnd } from '../src/server/underlying';

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
    const list = await listOptionsWithoutUnderlying(db);
    console.log(`${list.length} options without an underlying entry.`);
    let recorded = 0;
    let derived = 0;
    let noBar = 0;
    let failed = 0;

    // Options all have bars to fetch, so `withoutBars` (crypto) is empty.
    for (const { symbol, end, trades } of backfillFetches(list).fetches) {
      let done = 0;
      try {
        // The bars run past every fill but the day's latest. That is safe:
        // underlyingAtEntry reads only the bar holding each fill, and the
        // entry review resamples as of the fill, leaving out everything after.
        const bars = await fetchMinuteBars(symbol, fillMinuteEnd(end));
        for (const trade of trades) {
          const result = underlyingAtEntry(trade, bars);
          await saveUnderlying(db, trade.id, result);
          if (result.entry === null) noBar += 1;
          else recorded += 1;
          if (result.derivedStop) derived += 1;
          done += 1;
        }
      } catch (error) {
        console.error(`${symbol} to ${end.toISOString()}: ${error.message}`);
        failed += trades.length - done;
      }
      await pause();
    }

    console.log(
      `Recorded ${recorded} underlying entries, ${derived} with a derived stop.` +
        `${noBar ? ` ${noBar} had no bar holding the fill.` : ''}` +
        `${failed ? ` ${failed} left for the next run.` : ''}`
    );
    return failed ? 1 : 0;
  } finally {
    await db.$client.end();
  }
}

main().then((code) => {
  process.exitCode = code;
});
