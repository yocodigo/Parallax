import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createTestDb } from '../testing';

// Bring the test database up to the latest migration once per test run.
export default async function setup() {
  const db = createTestDb();
  await migrate(db, { migrationsFolder: './drizzle' });
  await db.$client.end();
}