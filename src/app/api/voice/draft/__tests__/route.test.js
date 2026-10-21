// @vitest-environment node
// The Anthropic SDK runs server-side only; jsdom would look like a browser to it.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { POST } from '../route';

const MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

const reviewOutput = {
  kind: 'review',
  symbol: 'NVDA',
  notes: 'Moved my stop and got stopped out anyway.',
  emotion: 'frustrated',
  mistakes: ['moved_stop'],
  plan: null,
};

// A Messages API response whose text is the structured output.
function message(output, overrides = {}) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: [{ type: 'text', text: JSON.stringify(output) }],
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

const post = (body) =>
  POST(
    new Request('http://localhost/api/voice/draft', { method: 'POST', body: JSON.stringify(body) })
  );

beforeEach(() => vi.stubEnv('ANTHROPIC_API_KEY', 'test-key'));
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/voice/draft', () => {
  it('asks Claude to structure the transcript and returns a validated draft', async () => {
    const requests = captureMessages(() => HttpResponse.json(message(reviewOutput)));

    const response = await post({ transcript: 'Moved my stop on NVDA, frustrated.' });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      draft: {
        kind: 'review',
        plan: null,
        entry: {
          notes: 'Moved my stop and got stopped out anyway.',
          symbol: 'NVDA',
          emotion: 'frustrated',
          mistakes: ['moved_stop'],
        },
      },
      fieldErrors: { plan: {}, entry: {} },
    });

    const [{ headers, body }] = requests;
    expect(headers.get('x-api-key')).toBe('test-key');
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.fallbacks).toBe('default');
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(JSON.stringify(body.messages)).toContain('Moved my stop on NVDA, frustrated.');
  });

  it('returns what a spoken plan is still missing', async () => {
    captureMessages(() =>
      HttpResponse.json(
        message({
          ...reviewOutput,
          kind: 'plan',
          mistakes: [],
          plan: {
            mode: null,
            symbol: 'AAPL',
            assetClass: 'stock',
            direction: 'long',
            quantity: 100,
            plannedEntry: 210,
            initialStop: null,
            target: null,
          },
        })
      )
    );

    const response = await post({ transcript: 'Thinking about a hundred AAPL at 210.' });

    expect(response.status).toBe(200);
    const { draft, fieldErrors } = await response.json();
    expect(draft.kind).toBe('plan');
    expect(fieldErrors.plan).toHaveProperty('mode');
    expect(fieldErrors.plan).toHaveProperty('initialStop');
  });

  it('rejects an empty transcript without calling Claude', async () => {
    const requests = captureMessages(() => HttpResponse.json(message(reviewOutput)));

    const response = await post({ transcript: '   ' });

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty('transcript');
    expect(requests).toHaveLength(0);
  });

  it('reports a missing API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');

    const response = await post({ transcript: 'Some note' });

    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('reports a declined request', async () => {
    captureMessages(() =>
      HttpResponse.json(
        message(reviewOutput, {
          content: [],
          stop_reason: 'refusal',
          stop_details: { type: 'refusal', category: null, explanation: null },
        })
      )
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await post({ transcript: 'Some note' });

    expect(response.status).toBe(502);
    expect((await response.json()).error).toMatch(/couldn't turn that note into a draft/i);
  });

  it('reports output that does not match the draft schema', async () => {
    captureMessages(() => HttpResponse.json(message({ ...reviewOutput, kind: 'thesis' })));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await post({ transcript: 'Some note' });

    expect(response.status).toBe(502);
  });

  it('reports an API error without passing on its details', async () => {
    captureMessages(() =>
      HttpResponse.json(
        { type: 'error', error: { type: 'invalid_request_error', message: 'internal detail' } },
        { status: 400 }
      )
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await post({ transcript: 'Some note' });

    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain('internal detail');
  });
});
