import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { fetchJson } from '../fetchJson';

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
});
