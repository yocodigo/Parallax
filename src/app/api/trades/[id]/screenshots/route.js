import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { addTradeScreenshot, listTradeScreenshots } from '@/db/screenshots';
import { withErrorLogging } from '@/lib/log';
import { MAX_SCREENSHOTS_PER_TRADE, parseScreenshotForm } from '@/lib/screenshot';

// Postgres rejects a malformed uuid with an error; to the client it's just not found.
const notFound = () => NextResponse.json({ error: 'Trade not found' }, { status: 404 });

// Returns { screenshots }: the trade's chart screenshots, oldest first, without their bytes.
export const GET = withErrorLogging('/api/trades/[id]/screenshots', async (request, { params }) => {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  return NextResponse.json({ screenshots: await listTradeScreenshots(getDb(), id) });
});

// Body: multipart form with `image` and an optional `label` (setup, entry, exit).
// Returns 201 { screenshot }, or 409 once the trade has the most allowed.
export const POST = withErrorLogging('/api/trades/[id]/screenshots', async (request, { params }) => {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return notFound();

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Expected a form with an image' }, { status: 400 });
  }

  const parsed = await parseScreenshotForm(formData);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid screenshot', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const result = await addTradeScreenshot(getDb(), id, parsed.data);
  if (result.error === 'not_found') return notFound();
  if (result.error === 'limit') {
    return NextResponse.json(
      { error: `A trade can have at most ${MAX_SCREENSHOTS_PER_TRADE} screenshots` },
      { status: 409 }
    );
  }
  return NextResponse.json({ screenshot: result.screenshot }, { status: 201 });
});
