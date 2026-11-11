import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { NextResponse } from 'next/server';
import { getDb } from '@/db';
import { getPerformanceReview, savePerformanceReview } from '@/db/performanceReviews';
import { logError, requestId, withErrorLogging } from '@/lib/log';
import { clientKey, rateLimit } from '@/lib/rateLimit';
import { REVIEW_SYSTEM_PROMPT, formatReviewInput, reviewOutputSchema } from '@/lib/reviewCoach';
import { parseReviewRange } from '@/lib/reviewRange';
import { gatherReviewFacts } from '@/server/reviewFacts';

const ROUTE = '/api/insights/review';

// Read fresh from the database on every request, never prerendered.
export const dynamic = 'force-dynamic';

const invalid = (error) =>
  NextResponse.json({ error: 'Invalid query', fieldErrors: { range: [error] } }, { status: 400 });

const failed = (request, details) => {
  // Claude's error details stay in the server log, not the response; the
  // request id lets the two be matched up.
  const id = requestId(request);
  logError('Performance review failed', { route: ROUTE, requestId: id, ...details });
  return NextResponse.json({ error: "Couldn't write the review. Try again.", requestId: id }, { status: 502 });
};

// A saved review's row as the response gives it; no row (null) stays null.
const toReview = (row) =>
  row && {
    sections: row.review,
    reviewedAt: row.reviewedAt,
    tradeCount: row.tradeCount,
    rangeFrom: row.rangeFrom,
    rangeTo: row.rangeTo,
  };

// The trades the figures cover: those with a P/L, as the listed trades are.
const tradeCountOf = (facts) => Object.values(facts.modes).reduce((total, mode) => total + mode.overall.trades, 0);

// Query: ?range=7d|30d|all|custom, and for custom ?from=YYYY-MM-DD&to=YYYY-MM-DD
// (New York days, both included). Returns { range, stats, tradeCount, review }:
// the headline figures of each mode that has a trade closed in the range
// (trades, wins, losses, scratches, winRatePct, netPnl, avgNetPnl), how many
// trades that is, and the last review written for it (or null). Never calls
// Claude: writing a review is the POST.
export const GET = withErrorLogging(ROUTE, async (request) => {
  const { searchParams } = new URL(request.url);
  // A parameter that is missing reads as absent, not as the string "null".
  const range = parseReviewRange({
    range: searchParams.get('range') ?? undefined,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  });
  if (!range.ok) return invalid(range.error);

  const facts = await gatherReviewFacts(getDb(), range);
  return NextResponse.json({
    range: { key: range.key, label: range.label, fromDay: range.fromDay, toDay: range.toDay },
    stats: Object.fromEntries(Object.entries(facts.modes).map(([mode, figures]) => [mode, figures.overall])),
    tradeCount: tradeCountOf(facts),
    review: toReview(await getPerformanceReview(getDb(), range.key)),
  });
});

// Body: { range, from, to }, as the GET's query. Asks Claude for a review of the
// range's trades, replaces the range's saved one, and returns { review } (see
// toReview), or a null review, without calling Claude, when no trade closed in it.
// A failed call keeps the earlier review.
export const POST = withErrorLogging(ROUTE, async (request) => {
  // Each review costs money, so it shares the voice routes' budget for paid calls.
  const limit = rateLimit(`voice:${clientKey(request)}`);
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const range = parseReviewRange(body ?? {});
  if (!range.ok) return invalid(range.error);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing ANTHROPIC_API_KEY in environment.' }, { status: 500 });
  }

  const facts = await gatherReviewFacts(getDb(), range);
  const tradeCount = tradeCountOf(facts);
  // Nothing to review, so there's no reason to pay for a call.
  if (tradeCount === 0) return NextResponse.json({ review: null, reason: 'No closed trades in this range' });

  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.beta.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      // If the model declines, the API retries on a fallback model in the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: REVIEW_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `<review_input>\n${formatReviewInput(facts)}\n</review_input>` }],
      output_config: { effort: 'medium', format: betaZodOutputFormat(reviewOutputSchema) },
    });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: 'Too many requests right now. Try again shortly.' }, { status: 429 });
    }
    return failed(request, { error });
  }

  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    return failed(request, { stopReason: response.stop_reason, stopDetails: response.stop_details });
  }

  const saved = await savePerformanceReview(getDb(), {
    rangeKey: range.key,
    review: response.parsed_output,
    tradeCount,
    rangeFrom: range.fromDay,
    rangeTo: range.toDay,
  });
  return NextResponse.json({ review: toReview(saved) });
});
