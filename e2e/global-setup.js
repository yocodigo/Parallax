import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resetDb } from '../src/db/testing';
import { E2E_DATABASE_URL } from '../playwright.config';

// Creates the e2e database the first time, brings it to the latest migration,
// and empties it, so every run starts from a blank journal.
export default async function setup() {
  const admin = new pg.Client({ connectionString: E2E_DATABASE_URL.replace(/\/parallax_e2e$/, '/parallax') });
  await admin.connect();
  const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'parallax_e2e'");
  if (rowCount === 0) await admin.query('CREATE DATABASE parallax_e2e');
  await admin.end();

  const db = drizzle(E2E_DATABASE_URL);
  await migrate(db, { migrationsFolder: './drizzle' });
  await resetDb(db);
  await db.$client.end();
}
