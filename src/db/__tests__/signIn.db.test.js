import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  clearSignInFailures,
  countSignInFailures,
  pruneSignInFailures,
  recordSignInFailure,
} from '../signIn';
import { signInFailures } from '../schema';
import { createTestDb, resetDb } from '../testing';

const db = createTestDb();

const at = (minutes) => new Date(Date.UTC(2026, 10, 2, 15, minutes));
const IP = '203.0.113.7';
const OTHER_IP = '198.51.100.4';

beforeEach(() => resetDb(db));
afterAll(() => db.$client.end());

describe('sign-in failures', () => {
  it('counts the failures from one IP since a time', async () => {
    await recordSignInFailure(db, IP, at(0));
    await recordSignInFailure(db, IP, at(10));
    await recordSignInFailure(db, IP, at(20));
    await recordSignInFailure(db, OTHER_IP, at(20));

    expect(await countSignInFailures(db, IP, at(0))).toBe(3);
    expect(await countSignInFailures(db, IP, at(10))).toBe(2);
    expect(await countSignInFailures(db, IP, at(21))).toBe(0);
    expect(await countSignInFailures(db, OTHER_IP, at(0))).toBe(1);
  });

  it("clears one IP's failures and leaves the others", async () => {
    await recordSignInFailure(db, IP, at(0));
    await recordSignInFailure(db, OTHER_IP, at(0));

    await clearSignInFailures(db, IP);

    expect(await countSignInFailures(db, IP, at(0))).toBe(0);
    expect(await countSignInFailures(db, OTHER_IP, at(0))).toBe(1);
  });

  it('prunes failures older than a time, from every IP', async () => {
    await recordSignInFailure(db, IP, at(0));
    await recordSignInFailure(db, OTHER_IP, at(5));
    await recordSignInFailure(db, IP, at(30));

    await pruneSignInFailures(db, at(30));

    const rows = await db.select().from(signInFailures);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ip: IP, failedAt: at(30) });
  });
});
