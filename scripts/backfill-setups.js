// Brings the context snapshots saved before version 3 up to it, in the
// journal's database (DATABASE_URL): `setups` (the four-touch break the trade
// went with, for its grade, and every setup detected, rules-v3 section 6) and
// `levels` (the level map at the fill). Run with `npm run db:backfill-setups`.
// It fetches Alpaca's minute and daily bars (keys from .env.local) once per
// symbol and New York day, a little apart to stay under the rate limit, and
// reads the day's plan as it is now (capture reads it at the entry). A failed
// fetch is reported and its trades left for the next run; the rest of each
// snapshot is untouched.
// Runs under tsx like seed-demo.js.
import { loadEnvConfig } from '@next/env';
import { drizzle } from 'drizzle-orm/node-postgres';
import { addContextSetupsAndLevels, listContextsWithoutLevels } from '../src/db/contexts';
import { getDailyPlan } from '../src/db/dailyPlans';
import * as schema from '../src/db/schema';
import { backfillFetches } from '../src/lib/context/backfill';
import { levelsAt, setupsAt } from '../src/lib/context/buildContext';
import { fetchDailyBars } from '../src/server/dailyBars';
import { fetchMinuteBars } from '../src/server/minuteBars';

// Alpaca's free plan allows 200 requests a minute, and each symbol and day
// makes two (minute and daily bars).
const PAUSE_MS = 700;

const pause = () => new Promise((resolve) => setTimeout(resolve, PAUSE_MS));

async function main() {
  loadEnvConfig(process.cwd());
  if (!process.env.DATABASE_URL) {
    console.error('Set DATABASE_URL (in .env.local) to the journal database.');
    return 1;
  }

  const db = drizzle(process.env.DATABASE_URL, { schema });
  try {
    const list = await listContextsWithoutLevels(db);
    console.log(`${list.length} snapshots before version 3.`);
    let added = 0;
    let failed = 0;

    const { withoutBars, fetches } = backfillFetches(list);
    for (const trade of withoutBars) {
      await addContextSetupsAndLevels(db, trade.id, { setups: null, levels: null });
      added += 1;
    }

    for (const { symbol, day, end, trades } of fetches) {
      let done = 0;
      try {
        const [bars, dailyBars, dailyPlan] = await Promise.all([
          fetchMinuteBars(symbol, end),
          fetchDailyBars(symbol, day),
          getDailyPlan(db, day, symbol),
        ]);
        for (const trade of trades) {
          const levels = levelsAt(trade, bars, { dailyBars, dailyPlan });
          await addContextSetupsAndLevels(db, trade.id, { setups: setupsAt(trade, bars, levels), levels });
          done += 1;
        }
      } catch (error) {
        console.error(`${symbol} on ${day}: ${error.message}`);
        failed += trades.length - done;
      }
      added += done;
      await pause();
    }

    console.log(`Brought ${added} up to version 3.${failed ? ` ${failed} left for the next run.` : ''}`);
    return failed ? 1 : 0;
  } finally {
    await db.$client.end();
  }
}

main().then((code) => {
  process.exitCode = code;
});
