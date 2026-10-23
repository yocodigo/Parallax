import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// Integration tests use their own database so they never touch your journal.
export const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://parallax:parallax@localhost:5432/parallax_test';

export function createTestDb() {
  return drizzle(testDatabaseUrl, { schema });
}

export async function resetDb(db) {
  await db.execute(sql`TRUNCATE trades, journal_entries, circuit_breaker_settings, strategies, strategy_rules, trade_rule_checks, trade_contexts`);
}