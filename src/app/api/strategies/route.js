import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { createStrategy, listStrategies } from '@/db/strategies';
import { withErrorLogging } from '@/lib/log';
import { parseStrategy } from '@/lib/strategy';

// Read fresh from the database on every request, never prerendered.
export const dynamic = 'force-dynamic';

// Returns { strategies }, each with its rules in checklist order.
export const GET = withErrorLogging('/api/strategies', async () => {
  return NextResponse.json({ strategies: await listStrategies(getDb()) });
});

// Body: { name, description?, rules: [{ text, kind }] }. Returns { strategy }.
export const POST = withErrorLogging('/api/strategies', async (request) => {
  const body = await request.json().catch(() => null);
  const parsed = parseStrategy(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid strategy', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const strategy = await createStrategy(getDb(), parsed.data);
  return NextResponse.json({ strategy }, { status: 201 });
});
