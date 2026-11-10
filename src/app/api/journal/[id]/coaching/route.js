import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { getJournalEntry, saveCoaching } from '@/db/journal';
import { getTrade } from '@/db/trades';
import { COACHING_SYSTEM_PROMPT, formatCoachingInput } from '@/lib/coaching';
import { logError, requestId, withErrorLogging } from '@/lib/log';
import { clientKey, rateLimit } from '@/lib/rateLimit';
import { nyDay } from '@/lib/setups/session';
import { gatherCoachingFacts } from '@/server/coachingFacts';

const ROUTE = '/api/journal/[id]/coaching';

const notFound = () => NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });

const failed = (request, details) => {
  // Claude's error details stay in the server log, not the response; the
  // request id lets the two be matched up.
  const id = requestId(request);
  logError('Coaching failed', { route: ROUTE, requestId: id, ...details });
  return NextResponse.json({ error: "Couldn't write the coaching. Try again.", requestId: id }, { status: 502 });
};

// Writes the coaching pass for a review and stores it on that review, replacing
// any earlier pass (the re-run button). A review linked to a trade coaches that
// trade alone, on the day it was filled; one with no trade coaches the New York
// day it was written on. Returns { coaching, coachedAt }, or a null coaching,
// without calling Claude, when there is no filled trade to coach.
export const POST = withErrorLogging(ROUTE, async (request, { params }) => {
  const { id } = await params;
  // Postgres rejects a malformed uuid with an error; to the client it's just not found.
  if (!z.uuid().safeParse(id).success) return notFound();

  // Each pass costs money, so it shares the voice routes' budget for paid calls.
  const limit = rateLimit(`voice:${clientKey(request)}`);
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  }

  const entry = await getJournalEntry(getDb(), id);
  if (!entry) return notFound();
  if (entry.kind !== 'review') {
    return NextResponse.json({ error: 'Only a review can be coached' }, { status: 409 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY in environment.' }, { status: 500 });
  }
  if (!process.env.ALPACA_KEY_ID || !process.env.ALPACA_SECRET_KEY) {
    return NextResponse.json({ error: 'Missing ALPACA_KEY_ID or ALPACA_SECRET_KEY in environment.' }, { status: 500 });
  }

  let scope = { day: nyDay(entry.createdAt) };
  if (entry.tradeId) {
    const trade = await getTrade(getDb(), entry.tradeId);
    // Nothing to coach, so there's no reason to pay for a call.
    if (!trade?.openedAt) return NextResponse.json({ coaching: null, reason: 'The linked trade has no fill yet' });
    scope = { day: nyDay(trade.openedAt), tradeId: trade.id };
  }

  const facts = await gatherCoachingFacts(getDb(), scope);
  if (!facts) return NextResponse.json({ coaching: null, reason: 'No trade was opened that day' });

  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // If the model declines, the API retries on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: COACHING_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `<coaching_input>\n${formatCoachingInput(facts)}\n</coaching_input>` }],
      output_config: { effort: 'medium' },
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'Too many requests right now. Try again shortly.' }, { status: 429 });
    }
    return failed(request, { error });
  }

  const coaching = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
  if (response.stop_reason === 'refusal' || !coaching) {
    return failed(request, { stopReason: response.stop_reason, stopDetails: response.stop_details });
  }

  // The entry is only ever a review here; a delete in between leaves nothing to save to.
  const saved = await saveCoaching(getDb(), id, coaching);
  if (!saved) return notFound();
  return NextResponse.json({ coaching: saved.coaching, coachedAt: saved.coachedAt });
});
