import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { savePlan } from '@/db/journal';
import { parseJournalEntry } from '@/lib/journalEntry';
import { parseTradePlan } from '@/lib/tradePlan';

const fieldErrors = (result) => (result.success ? {} : z.flattenError(result.error).fieldErrors);

// Body: { plan: { ...trade plan }, entry: { notes, emotion?, mistakes? } }
export async function POST(request) {
  const body = await request.json().catch(() => null);
  const plan = parseTradePlan(body?.plan);
  const entry = parseJournalEntry({ ...body?.entry, kind: 'plan' });

  if (!plan.success || !entry.success) {
    return NextResponse.json(
      { error: 'Invalid plan', fieldErrors: { plan: fieldErrors(plan), entry: fieldErrors(entry) } },
      { status: 400 }
    );
  }

  const saved = await savePlan(getDb(), { plan: plan.data, entry: entry.data });
  return NextResponse.json(saved, { status: 201 });
}