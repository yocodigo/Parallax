import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { getDb } from '@/db';
import { getPerformanceReview, savePerformanceReview } from '@/db/performanceReviews';
import { trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { captureErrorLogs } from '@/mocks/logs';
import { server } from '@/mocks/server';
import { GET, POST } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});
const limiter = vi.hoisted(() => ({ limited: false }));
vi.mock('@/lib/rateLimit', () => ({ clientKey: () => 'test', rateLimit: () => ({ ok: !limiter.limited }) }));

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const SECTIONS = {
  strengths: 'Band cross made money.',
  patternsToFix: 'Nothing repeated.',
  ruleAdherence: 'No flagged trades.',
  emotionalPatterns: 'Too few reviews.',
  recommendations: 'Keep the size at 1.',
};
const RANGE = { range: 'custom', from: '2026-04-01', to: '2026-04-30' };

// A Messages API response whose text is the structured output.
function message(overrides = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: JSON.stringify(SECTIONS) }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
    ...overrides,
  };
}

function captureMessages(response) {
  const requests = [];
  server.use(
    http.post(MESSAGES_URL, async ({ request }) => {
      requests.push(await request.json());
      return response();
    })
  );
  return requests;
}

const get = (query) => GET(new Request(`http://localhost/api/insights/review?${new URLSearchParams(query)}`));
const post = (body) =>
  POST(new Request('http://localhost/api/insights/review', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }));

// A closed live option, +$10, filled on 2026-04-13.
const addTrade = (overrides) =>
  getDb()
    .insert(trades)
    .values({
      mode: 'live',
      symbol: 'SPY',
      assetClass: 'option',
      optionType: 'call',
      strike: 600,
      expiration: '2026-04-30',
      direction: 'long',
      quantity: 1,
      multiplier: 100,
      entryPrice: 1,
      exitPrice: 1.1,
      openedAt: new Date('2026-04-13T14:00:00Z'),
      closedAt: new Date('2026-04-13T15:00:00Z'),
      ...overrides,
    })
    .returning();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await resetDb(getDb());
  limiter.limited = false;
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
});
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
afterAll(async () => {
  server.close();
  await getDb().$client.end();
});

describe('GET /api/insights/review', () => {
  it('answers 400 for a range it cannot read', async () => {
    const response = await get({ range: 'year' });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'Invalid query', fieldErrors: { range: [expect.any(String)] } });
  });

  it('gives the headline figures of each mode and no review before one is written', async () => {
    await addTrade();
    await addTrade({ mode: 'backtest', exitPrice: 0.9 });

    const body = await (await get(RANGE)).json();

    expect(body.range).toEqual({ key: 'custom:2026-04-01:2026-04-30', label: '2026-04-01 to 2026-04-30', fromDay: '2026-04-01', toDay: '2026-04-30' });
    expect(body.tradeCount).toBe(2);
    expect(body.stats.live).toMatchObject({ trades: 1, winRatePct: 100, netPnl: 10, avgNetPnl: 10 });
    expect(body.stats.backtest).toMatchObject({ trades: 1, netPnl: -10 });
    expect(body.review).toBeNull();
  });

  it('gives the saved review of the range', async () => {
    await addTrade();
    await savePerformanceReview(getDb(), {
      rangeKey: 'custom:2026-04-01:2026-04-30',
      review: SECTIONS,
      tradeCount: 1,
      rangeFrom: '2026-04-01',
      rangeTo: '2026-04-30',
    });

    const { review } = await (await get(RANGE)).json();

    expect(review).toMatchObject({ sections: SECTIONS, tradeCount: 1, rangeFrom: '2026-04-01', rangeTo: '2026-04-30' });
    expect(review.reviewedAt).toEqual(expect.any(String));
  });

  it('gives no stats for a range with no trade', async () => {
    expect(await (await get(RANGE)).json()).toMatchObject({ stats: {}, tradeCount: 0, review: null });
  });
});

describe('POST /api/insights/review', () => {
  it('sends the facts to Claude as JSON, stores the five sections, and returns them', async () => {
    await addTrade({ symbol: 'IWM' });
    const requests = captureMessages(() => HttpResponse.json(message()));

    const response = await post(RANGE);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.review).toMatchObject({ sections: SECTIONS, tradeCount: 1 });
    expect(requests).toHaveLength(1);
    expect(requests[0].system.startsWith('You are a trading performance coach.')).toBe(true);
    const content = requests[0].messages[0].content;
    expect(content).toMatch(/^<review_input>\n\{[\s\S]*\}\n<\/review_input>$/);
    const facts = JSON.parse(content.replace(/^<review_input>\n|\n<\/review_input>$/g, ''));
    expect(facts.trades[0]).toMatchObject({ symbol: 'IWM', ref: 1 });
    expect(facts.modes.live.overall.trades).toBe(1);
    expect((await getPerformanceReview(getDb(), 'custom:2026-04-01:2026-04-30')).review).toEqual(SECTIONS);
  });

  it('replaces the earlier review of the range', async () => {
    await addTrade();
    captureMessages(() => HttpResponse.json(message({ content: [{ type: 'text', text: JSON.stringify({ ...SECTIONS, strengths: 'Second.' }) }] })));
    await savePerformanceReview(getDb(), { rangeKey: 'custom:2026-04-01:2026-04-30', review: SECTIONS, tradeCount: 1, rangeFrom: '2026-04-01', rangeTo: '2026-04-30' });

    await post(RANGE);

    expect((await getPerformanceReview(getDb(), 'custom:2026-04-01:2026-04-30')).review.strengths).toBe('Second.');
  });

  it('does not call Claude when nothing closed in the range', async () => {
    const requests = captureMessages(() => HttpResponse.json(message()));

    const response = await post(RANGE);

    expect(await response.json()).toEqual({ review: null, reason: 'No closed trades in this range' });
    expect(requests).toHaveLength(0);
  });

  it('answers 400 for a body that is not JSON or names no readable range', async () => {
    expect((await post('not json')).status).toBe(400);
    expect((await post({ range: 'year' })).status).toBe(400);
  });

  it('keeps the earlier review and answers 502 when Claude refuses or returns something else', async () => {
    await addTrade();
    await savePerformanceReview(getDb(), { rangeKey: 'custom:2026-04-01:2026-04-30', review: SECTIONS, tradeCount: 1, rangeFrom: '2026-04-01', rangeTo: '2026-04-30' });
    const logs = captureErrorLogs();

    captureMessages(() => HttpResponse.json(message({ stop_reason: 'refusal', content: [] })));
    const refused = await post(RANGE);
    server.resetHandlers();
    captureMessages(() => HttpResponse.json(message({ content: [{ type: 'text', text: JSON.stringify({ strengths: 'Only one section.' }) }] })));
    const incomplete = await post(RANGE);

    for (const response of [refused, incomplete]) {
      expect(response.status).toBe(502);
      const body = await response.json();
      expect(body).toMatchObject({ error: expect.any(String), requestId: expect.any(String) });
      expect(logs()).toContainEqual(expect.objectContaining({ message: 'Performance review failed', requestId: body.requestId }));
    }
    expect((await getPerformanceReview(getDb(), 'custom:2026-04-01:2026-04-30')).review).toEqual(SECTIONS);
  });

  it('answers 429 when Claude is rate limited, and when the caller is over the request budget', async () => {
    await addTrade();
    captureMessages(() =>
      HttpResponse.json(
        { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } },
        { status: 429, headers: { 'x-should-retry': 'false' } }
      )
    );
    expect((await post(RANGE)).status).toBe(429);

    limiter.limited = true;
    expect((await post(RANGE)).status).toBe(429);
  });

  it('answers 500 when the Anthropic key is missing', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    await addTrade();

    expect((await post(RANGE)).status).toBe(500);
  });
});
