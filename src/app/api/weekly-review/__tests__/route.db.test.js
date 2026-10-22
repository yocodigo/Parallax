import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { getDb } from '@/db';
import { addJournalEntry } from '@/db/journal';
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

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const DAY_MS = 24 * 60 * 60 * 1000;
const daysAgo = (days) => new Date(Date.now() - days * DAY_MS);

const REVIEW = 'This week you logged two entries. You moved your stop on NVDA again.';

// A Messages API response whose text is the review.
function message(overrides = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: REVIEW }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 50 },
    ...overrides,
  };
}

// Record each request sent to Claude and answer with `response`.
function captureMessages(response) {
  const requests = [];
  server.use(
    http.post(MESSAGES_URL, async ({ request }) => {
      requests.push({ headers: request.headers, body: await request.json() });
      return response();
    })
  );
  return requests;
}

const post = () => POST(new Request('http://localhost/api/weekly-review', { method: 'POST' }));

// The db project has no shared MSW setup, so this file runs its own.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await resetDb(getDb());
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

describe('POST /api/weekly-review', () => {
  it("asks Claude to review this week's entries", async () => {
    await addJournalEntry(getDb(), {
      kind: 'review',
      symbol: 'NVDA',
      notes: 'Moved my stop again.',
      mistakes: ['moved_stop'],
      createdAt: daysAgo(2),
    });
    await addJournalEntry(getDb(), { kind: 'review', notes: 'Last month', createdAt: daysAgo(30) });
    const requests = captureMessages(() => HttpResponse.json(message()));

    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ review: REVIEW, entryCount: 1 });

    const [{ headers, body }] = requests;
    expect(headers.get('x-api-key')).toBe('test-key');
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.fallbacks).toBe('default');
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    const prompt = JSON.stringify(body.messages);
    expect(prompt).toContain('Moved my stop again.');
    expect(prompt).toContain('Mistakes: Moved stop');
    expect(prompt).not.toContain('Last month');
  });

  it('skips Claude when nothing was logged this week', async () => {
    await addJournalEntry(getDb(), { kind: 'review', notes: 'Last month', createdAt: daysAgo(30) });
    const requests = captureMessages(() => HttpResponse.json(message()));

    const response = await post();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ review: null, entryCount: 0 });
    expect(requests).toHaveLength(0);
  });

  it('reports a missing API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    const response = await post();

    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('reports a declined request', async () => {
    await addJournalEntry(getDb(), { kind: 'review', notes: 'Some note', createdAt: daysAgo(1) });
    captureMessages(() =>
      HttpResponse.json(
        message({
          content: [],
          stop_reason: 'refusal',
          stop_details: { type: 'refusal', category: null, explanation: null },
        })
      )
    );
    const logs = captureErrorLogs();

    const response = await post();

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body.error).toMatch(/couldn't write this week's review/i);
    expect(logs()).toEqual([
      expect.objectContaining({ message: 'Weekly review failed', requestId: body.requestId, stopReason: 'refusal' }),
    ]);
  });

  it('reports an API error without passing on its details', async () => {
    await addJournalEntry(getDb(), { kind: 'review', notes: 'Some note', createdAt: daysAgo(1) });
    captureMessages(() =>
      HttpResponse.json(
        { type: 'error', error: { type: 'invalid_request_error', message: 'internal detail' } },
        { status: 400 }
      )
    );
    const logs = captureErrorLogs();

    const response = await post();

    expect(response.status).toBe(502);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain('internal detail');
    expect(logs()).toEqual([
      expect.objectContaining({
        message: 'Weekly review failed',
        requestId: body.requestId,
        error: expect.objectContaining({ message: expect.stringContaining('internal detail') }),
      }),
    ]);
  });
});
