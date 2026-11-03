import { and, count, eq, gte, lt } from 'drizzle-orm';
import { signInFailures } from './schema';

export async function recordSignInFailure(db, ip, at = new Date()) {
  await db.insert(signInFailures).values({ ip, failedAt: at });
}

export async function countSignInFailures(db, ip, since) {
  const [row] = await db
    .select({ n: count() })
    .from(signInFailures)
    .where(and(eq(signInFailures.ip, ip), gte(signInFailures.failedAt, since)));
  return row.n;
}

// After a correct password, so earlier typos don't count against the next sign-in.
export async function clearSignInFailures(db, ip) {
  await db.delete(signInFailures).where(eq(signInFailures.ip, ip));
}

export async function pruneSignInFailures(db, before) {
  await db.delete(signInFailures).where(lt(signInFailures.failedAt, before));
}
