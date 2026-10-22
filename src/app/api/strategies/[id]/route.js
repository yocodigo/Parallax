import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { updateStrategy } from '@/db/strategies';
import { withErrorLogging } from '@/lib/log';
import { parseStrategy } from '@/lib/strategy';

const notFound = () => NextResponse.json({ error: 'Strategy not found' }, { status: 404 });

// Body: the whole strategy, rules in checklist order; a rule sent with its id
// is edited in place, rules left out are removed. Returns { strategy }.
export const PUT = withErrorLogging('/api/strategies/[id]', async (request, { params }) => {
  const { id } = await params;
  // Postgres rejects a malformed uuid with an error; to the client it's just not found.
  if (!z.uuid().safeParse(id).success) return notFound();

  const body = await request.json().catch(() => null);
  const parsed = parseStrategy(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid strategy', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const strategy = await updateStrategy(getDb(), id, parsed.data);
  if (!strategy) return notFound();
  return NextResponse.json({ strategy });
});
