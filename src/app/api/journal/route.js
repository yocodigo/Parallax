import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { addJournalEntry, listJournalEntries } from '@/db/journal';
import { parseJournalEntry } from '@/lib/journalEntry';
import { withErrorLogging } from '@/lib/log';

// The journal is always read fresh from the database, never prerendered.
export const dynamic = 'force-dynamic';

export const GET = withErrorLogging('/api/journal', async () => {
  const entries = await listJournalEntries(getDb());
  return NextResponse.json({ entries });
});

export const POST = withErrorLogging('/api/journal', async (request) => {
  const body = await request.json().catch(() => null);
  const parsed = parseJournalEntry(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid journal entry', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const entry = await addJournalEntry(getDb(), parsed.data);
  return NextResponse.json({ entry }, { status: 201 });
});
