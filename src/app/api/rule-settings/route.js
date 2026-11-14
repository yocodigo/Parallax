import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { getRuleSettings, saveRuleSettings } from '@/db/settings';
import { withErrorLogging } from '@/lib/log';
import { parseRuleSettings } from '@/lib/ruleSettings';

// Read fresh from the database on every request, never prerendered.
export const dynamic = 'force-dynamic';

// Returns { settings }: the trader's option rules, or the defaults.
export const GET = withErrorLogging('/api/rule-settings', async () => {
  return NextResponse.json({ settings: await getRuleSettings(getDb()) });
});

// Body: the full rules (anything left out takes its default). Returns { settings }.
export const PUT = withErrorLogging('/api/rule-settings', async (request) => {
  const body = await request.json().catch(() => null);
  const parsed = parseRuleSettings(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid rules', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  return NextResponse.json({ settings: await saveRuleSettings(getDb(), parsed.data) });
});
