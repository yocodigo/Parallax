import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { apiErrorMessage, fetchJson } from '../fetchJson';

describe('fetchJson', () => {
  it('returns the parsed body of a successful response', async () => {
    server.use(http.get('*/api/thing', () => HttpResponse.json({ ok: 1 })));

    await expect(fetchJson('http://localhost/api/thing')).resolves.toEqual({ ok: 1 });
  });

  it("throws the server's error message when the request fails", async () => {
    server.use(http.get('*/api/thing', () => HttpResponse.json({ error: 'Nope' }, { status: 500 })));

    await expect(fetchJson('http://localhost/api/thing')).rejects.toThrow('Nope');
  });

  it('throws a generic message when the failed response has none', async () => {
    server.use(http.get('*/api/thing', () => HttpResponse.json({}, { status: 502 })));

    await expect(fetchJson('http://localhost/api/thing')).rejects.toThrow('Request failed');
  });

  it("includes the request id, so the error can be found in the server's logs", async () => {
    server.use(
      http.get('*/api/thing', () => HttpResponse.json({ error: 'Nope', requestId: 'req-123' }, { status: 500 }))
    );

    await expect(fetchJson('http://localhost/api/thing')).rejects.toThrow('Nope (Reference: req-123)');
  });

  it('throws a generic message when the failed response is not JSON', async () => {
    server.use(http.get('*/api/thing', () => new HttpResponse('<html>Gateway Timeout</html>', { status: 504 })));

    await expect(fetchJson('http://localhost/api/thing')).rejects.toThrow('Request failed');
  });
});

describe('apiErrorMessage', () => {
  it("uses the server's message, or the fallback when there is none", () => {
    expect(apiErrorMessage({ error: 'Nope' }, 'Request failed')).toBe('Nope');
    expect(apiErrorMessage({}, 'Request failed')).toBe('Request failed');
  });

  it('adds the request id as a reference', () => {
    expect(apiErrorMessage({ error: 'Nope', requestId: 'req-123' }, 'Request failed')).toBe(
      'Nope (Reference: req-123)'
    );
  });
});
