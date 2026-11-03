import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { getDb } from '@/db';
import { eq } from 'drizzle-orm';
import { addJournalEntry, getJournalEntry, saveCoaching } from '@/db/journal';
import { journalEntries, trades } from '@/db/schema';
import { resetDb } from '@/db/testing';
import { captureErrorLogs } from '@/mocks/logs';
import { server } from '@/mocks/server';
import { POST } from '../route';

// Swap the app's database for the test database. Everything else is real.
vi.mock('@/db', async () => {
  const { createTestDb } = await import('@/db/testing');
  const db = createTestDb();
  return { getDb: () => db };
});
const limiter = vi.hoisted(() => ({ limited: false }));
vi.mock('@/lib/rateLimit', () => ({ clientKey: () => 'test', rateLimit: () => ({ ok: !limiter.limited }) }));
// No Alpaca in these tests: the day's trades have no bars.
vi.mock('@/server/minuteBars', () => ({ fetchMinuteBars: async () => [] }));

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const COACHING = 'You exited SPY early again. Hold to the first target next time.';

function message(overrides = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: COACHING }],
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

const post = (id) =>
  POST(new Request(`http://localhost/api/journal/${id}/coaching`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });

// A review written at 6pm New York time on 2026-10-29, after a trade that day.
const reviewEntry = (overrides) =>
  addJournalEntry(getDb(), { kind: 'review', notes: 'Exited early.', createdAt: new Date('2026-10-29T22:00:00Z'), ...overrides });

const addTrade = () =>
  getDb()
    .insert(trades)
    .values({
      mode: 'live',
      symbol: 'SPY',
      assetClass: 'stock',
      direction: 'long',
      quantity: 10,
      plannedEntry: 100,
      initialStop: 98,
      entryPrice: 100,
      openedAt: new Date('2026-10-29T14:00:00Z'),
      exitPrice: 101,
      closedAt: new Date('2026-10-29T15:00:00Z'),
    })
    .returning();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await resetDb(getDb());
  limiter.limited = false;
  vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
  vi.stubEnv('ALPACA_KEY_ID', 'key');
  vi.stubEnv('ALPACA_SECRET_KEY', 'secret');
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

describe('POST /api/journal/[id]/coaching', () => {
  it("coaches the review's day and stores the text on the review", async () => {
    const review = await reviewEntry();
    await addTrade();
    const requests = captureMessages(() => HttpResponse.json(message()));

    const response = await post(review.id);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.coaching).toBe(COACHING);
    expect(body.coachedAt).toBeTruthy();
    expect(requests).toHaveLength(1);
    expect(requests[0].system).toContain('You coach a day trader');
    expect(requests[0].messages[0].content).toMatch(/^<coaching_input>[\s\S]*<day date=[\s\S]*<\/coaching_input>$/);
    expect((await getJournalEntry(getDb(), review.id)).coaching).toBe(COACHING);
  });

  it('answers 404 for an unknown or malformed id', async () => {
    expect((await post('not-a-uuid')).status).toBe(404);
    expect((await post('00000000-0000-0000-0000-000000000000')).status).toBe(404);
  });

  it('answers 409 for an entry that is not a review', async () => {
    const plan = await addJournalEntry(getDb(), { kind: 'plan', notes: 'A plan.' });

    expect((await post(plan.id)).status).toBe(409);
  });

  it('does not call Claude when no trade was opened that day', async () => {
    const review = await reviewEntry();
    const requests = captureMessages(() => HttpResponse.json(message()));

    const response = await post(review.id);

    expect(await response.json()).toMatchObject({ coaching: null });
    expect(requests).toHaveLength(0);
    expect((await getJournalEntry(getDb(), review.id)).coaching).toBeNull();
  });

  it('keeps the earlier coaching when Claude fails', async () => {
    const review = await reviewEntry();
    await addTrade();
    await saveCoaching(getDb(), review.id, 'Earlier pass.');
    captureMessages(() => HttpResponse.json({ type: 'error', error: { type: 'invalid_request_error', message: 'boom' } }, { status: 400 }));
    const logs = captureErrorLogs();

    const response = await post(review.id);

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(logs()).toContainEqual(
      expect.objectContaining({ message: 'Coaching failed', requestId: body.requestId })
    );
    expect((await getJournalEntry(getDb(), review.id)).coaching).toBe('Earlier pass.');
  });

  it('replaces an earlier pass with the new text', async () => {
    const review = await reviewEntry();
    await addTrade();
    const earlier = await saveCoaching(getDb(), review.id, 'Earlier pass.');
    captureMessages(() => HttpResponse.json(message()));

    const body = await (await post(review.id)).json();

    expect(body.coaching).toBe(COACHING);
    expect(new Date(body.coachedAt) > earlier.coachedAt).toBe(true);
    expect((await getJournalEntry(getDb(), review.id)).coaching).toBe(COACHING);
  });

  it('answers 502 and stores nothing when Claude refuses or returns no text', async () => {
    const review = await reviewEntry();
    await addTrade();
    captureErrorLogs();

    captureMessages(() => HttpResponse.json(message({ stop_reason: 'refusal', content: [] })));
    expect((await post(review.id)).status).toBe(502);

    server.resetHandlers();
    captureMessages(() => HttpResponse.json(message({ content: [{ type: 'text', text: '  ' }] })));
    expect((await post(review.id)).status).toBe(502);

    expect((await getJournalEntry(getDb(), review.id)).coaching).toBeNull();
  });

  it('answers 429 when Claude is rate limited', async () => {
    const review = await reviewEntry();
    await addTrade();
    captureMessages(() =>
      HttpResponse.json(
        { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } },
        { status: 429, headers: { 'x-should-retry': 'false' } }
      )
    );

    expect((await post(review.id)).status).toBe(429);
  });

  it('answers 429 when the caller is over the request budget', async () => {
    const review = await reviewEntry();
    limiter.limited = true;
    const requests = captureMessages(() => HttpResponse.json(message()));

    expect((await post(review.id)).status).toBe(429);
    expect(requests).toHaveLength(0);
  });

  it('answers 500 when a key is missing', async () => {
    const review = await reviewEntry();
    await addTrade();

    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect((await post(review.id)).status).toBe(500);

    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubEnv('ALPACA_SECRET_KEY', '');
    expect((await post(review.id)).status).toBe(500);
  });

  it('answers 404 when the review is deleted while Claude is writing', async () => {
    const review = await reviewEntry();
    await addTrade();
    captureMessages(() => {
      // The handler runs inside the Claude call, between the lookup and the save.
      return getDb()
        .delete(journalEntries)
        .where(eq(journalEntries.id, review.id))
        .then(() => HttpResponse.json(message()));
    });

    expect((await post(review.id)).status).toBe(404);
  });
});
