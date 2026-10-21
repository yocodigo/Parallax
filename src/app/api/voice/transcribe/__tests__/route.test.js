// @vitest-environment node
// Node's own Request, File, and FormData, as in a real route handler.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { POST } from '../route';

const SCRIBE_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

function post({ keyterms = [], file = new File([new Uint8Array(1000)], 'note.webm') } = {}) {
  const body = new FormData();
  if (file) body.append('audio', file);
  for (const term of keyterms) body.append('keyterms', term);
  return POST(new Request('http://localhost/api/voice/transcribe', { method: 'POST', body }));
}

beforeEach(() => vi.stubEnv('ELEVENLABS_API_KEY', 'test-key'));
afterEach(() => vi.unstubAllEnvs());

describe('POST /api/voice/transcribe', () => {
  it('sends the recording and tickers to Scribe and returns the transcript', async () => {
    let sent;
    server.use(
      http.post(SCRIBE_URL, async ({ request }) => {
        const form = await request.formData();
        sent = {
          apiKey: request.headers.get('xi-api-key'),
          model: form.get('model_id'),
          file: form.get('file'),
          keyterms: form.getAll('keyterms'),
        };
        return HttpResponse.json({ text: 'Long a hundred AAPL at 210.' });
      })
    );

    const response = await post({ keyterms: ['aapl', 'SPY'] });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ text: 'Long a hundred AAPL at 210.' });
    expect(sent.apiKey).toBe('test-key');
    expect(sent.model).toBe('scribe_v2');
    expect(sent.file.size).toBe(1000);
    expect(sent.keyterms).toEqual(['AAPL', 'SPY']);
  });

  it('rejects a request without a recording', async () => {
    const response = await post({ file: null });

    expect(response.status).toBe(400);
    expect((await response.json()).fieldErrors).toHaveProperty('audio');
  });

  it('rejects a body that is not a form', async () => {
    const response = await POST(
      new Request('http://localhost/api/voice/transcribe', { method: 'POST', body: 'not a form' })
    );

    expect(response.status).toBe(400);
  });

  it('reports a missing API key', async () => {
    vi.stubEnv('ELEVENLABS_API_KEY', '');

    const response = await post();

    expect(response.status).toBe(500);
    expect((await response.json()).error).toMatch(/ELEVENLABS_API_KEY/);
  });

  it('reports a Scribe failure without passing on its details', async () => {
    server.use(
      http.post(SCRIBE_URL, () =>
        HttpResponse.json({ detail: [{ msg: 'internal detail' }] }, { status: 422 })
      )
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await post();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'Transcription failed. Try again.' });
  });

  it('reports a network failure the same way', async () => {
    server.use(http.post(SCRIBE_URL, () => HttpResponse.error()));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const response = await post();

    expect(response.status).toBe(502);
  });
});
