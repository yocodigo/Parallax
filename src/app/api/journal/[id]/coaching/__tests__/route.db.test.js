import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { getDb } from '@/db';
import { addJournalEntry, getJournalEntry } from '@/db/journal';
import { trades } from '@/db/schema';
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
    const { saveCoaching } = await import('@/db/journal');
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
});
