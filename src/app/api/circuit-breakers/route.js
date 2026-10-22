import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { loadBreakerStatus, saveBreakerSettings } from '@/db/settings';
import { parseBreakerSettings } from '@/lib/circuitBreakerSettings';
import { withErrorLogging } from '@/lib/log';

// Read fresh from the database on every request, never prerendered.
export const dynamic = 'force-dynamic';

// Returns { settings, status }: the trader's limits and what's tripped now.
export const GET = withErrorLogging('/api/circuit-breakers', async () => {
  return NextResponse.json(await loadBreakerStatus(getDb()));
});

// Body: the full settings (a limit left out is off). Returns { settings, status }.
export const PUT = withErrorLogging('/api/circuit-breakers', async (request) => {
  const body = await request.json().catch(() => null);
  const parsed = parseBreakerSettings(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid circuit breakers', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  await saveBreakerSettings(getDb(), parsed.data);
  return NextResponse.json(await loadBreakerStatus(getDb()));
});
