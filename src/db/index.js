import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// Created on first use rather than at import, so builds don't need a database.
// Cached on globalThis so hot reloading in development doesn't open a new
// connection pool every time a file changes.
export function getDb() {
  globalThis.parallaxDb ??= drizzle(process.env.DATABASE_URL, { schema });
  return globalThis.parallaxDb;
}