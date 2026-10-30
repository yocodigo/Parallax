import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { deleteTradeScreenshot, getTradeScreenshot } from '@/db/screenshots';
import { withErrorLogging } from '@/lib/log';

const validIds = ({ id, shotId }) => z.uuid().safeParse(id).success && z.uuid().safeParse(shotId).success;

const notFound = () => NextResponse.json({ error: 'Screenshot not found' }, { status: 404 });

// The image itself, as uploaded. A screenshot never changes once stored, so the
// browser may keep it, but only the browser: it's private trade data.
export const GET = withErrorLogging('/api/trades/[id]/screenshots/[shotId]', async (request, { params }) => {
  const ids = await params;
  if (!validIds(ids)) return notFound();

  const image = await getTradeScreenshot(getDb(), ids.id, ids.shotId);
  if (!image) return notFound();

  return new Response(image.bytes, {
    headers: {
      'Content-Type': image.contentType,
      // The type was checked on upload; don't let the browser guess another.
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  });
});

export const DELETE = withErrorLogging('/api/trades/[id]/screenshots/[shotId]', async (request, { params }) => {
  const ids = await params;
  if (!validIds(ids)) return notFound();

  if (!(await deleteTradeScreenshot(getDb(), ids.id, ids.shotId))) return notFound();
  return new Response(null, { status: 204 });
});
