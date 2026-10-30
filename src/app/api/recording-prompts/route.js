import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { getRecordingPrompts, saveRecordingPrompts } from '@/db/settings';
import { parseRecordingPrompts } from '@/lib/recordingPrompts';
import { withErrorLogging } from '@/lib/log';

// Read fresh from the database on every request, never prerendered.
export const dynamic = 'force-dynamic';

// Returns the prompts shown next to the record button.
export const GET = withErrorLogging('/api/recording-prompts', async () => {
  return NextResponse.json(await getRecordingPrompts(getDb()));
});

// Body: all three prompts. Returns them as saved.
export const PUT = withErrorLogging('/api/recording-prompts', async (request) => {
  const body = await request.json().catch(() => null);
  const parsed = parseRecordingPrompts(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid recording prompts', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  return NextResponse.json(await saveRecordingPrompts(getDb(), parsed.data));
});
