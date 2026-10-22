import { eq } from 'drizzle-orm';
import { DEFAULT_BREAKER_SETTINGS } from '@/lib/circuitBreakerSettings';
import { circuitBreakerSettings } from './schema';

// The settings row without its bookkeeping columns.
const pickSettings = ({ maxDailyLossR, maxTradesPerDay, cooldownAfterLosses, cooldownMinutes, modes }) => ({
  maxDailyLossR,
  maxTradesPerDay,
  cooldownAfterLosses,
  cooldownMinutes,
  modes,
});

// The trader's circuit breakers, or the defaults (every limit off) until
// they've saved some.
export async function getBreakerSettings(db) {
  const [row] = await db.select().from(circuitBreakerSettings).where(eq(circuitBreakerSettings.id, 1));
  return row ? pickSettings(row) : { ...DEFAULT_BREAKER_SETTINGS };
}

// Replaces the settings; there's only ever the one row.
export async function saveBreakerSettings(db, settings) {
  const values = pickSettings(settings);
  const [row] = await db
    .insert(circuitBreakerSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: circuitBreakerSettings.id, set: values })
    .returning();
  return pickSettings(row);
}
