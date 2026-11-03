import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { deleteJournalEntry } from '@/db/journal';
import { withErrorLogging } from '@/lib/log';

const ROUTE = '/api/journal/[id]';

// Deletes a journal entry. A plan whose trade has been filled answers 409 and
// stays, since the entry holds the trade's controls; a plan never filled goes
// together with its trade.
export const DELETE = withErrorLogging(ROUTE, async (_request, { params }) => {
  const { id } = await params;
  // Postgres rejects a malformed uuid with an error; to the client it's just not found.
  if (!z.uuid().safeParse(id).success) {
    return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
  }

  const result = await deleteJournalEntry(getDb(), id);
  if (result.reason === 'not_found') {
    return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
  }
  if (result.reason === 'filled') {
    return NextResponse.json(
      { error: "This plan's trade has been filled, so the entry can't be deleted." },
      { status: 409 }
    );
  }
  return NextResponse.json({ deleted: true });
});
