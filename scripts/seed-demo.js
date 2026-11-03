// Seeds the public demo's database with the made-up week (src/lib/demoSeed.js).
// Run with `npm run db:seed-demo` after migrating that database. It reads
// DEMO_DATABASE_URL, never DATABASE_URL, and seedDemo refuses any database
// that already has a trade, journal entry, strategy, or daily plan. It runs
// under tsx with jsconfig.json's paths, which resolve the repository modules'
// @/ alias and extensionless imports that plain Node can't.
import { loadEnvConfig } from '@next/env';
import { drizzle } from 'drizzle-orm/node-postgres';
import { seedDemo } from '../src/db/demoSeed';
import * as schema from '../src/db/schema';
import * as demo from '../src/lib/demoSeed';

async function main() {
  loadEnvConfig(process.cwd());
  const url = process.env.DEMO_DATABASE_URL;
  if (!url) {
    console.error('Set DEMO_DATABASE_URL to the demo database (never your journal).');
    return 1;
  }
  if (url === process.env.DATABASE_URL) {
    console.error("DEMO_DATABASE_URL is the app's own DATABASE_URL. Point it at the demo database.");
    return 1;
  }

  const db = drizzle(url, { schema });
  try {
    const result = await seedDemo(db, demo);
    if (!result.seeded) {
      console.error('That database already has a trade, journal entry, strategy, or daily plan; nothing was changed.');
      return 1;
    }
    console.log(`Seeded ${result.trades} trades and ${result.entries} journal entries.`);
    return 0;
  } finally {
    await db.$client.end();
  }
}

main().then((code) => {
  process.exitCode = code;
});
