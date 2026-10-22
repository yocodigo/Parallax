// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logError, requestId, withErrorLogging } from '../log';

afterEach(() => vi.restoreAllMocks());

// What logError wrote, parsed back from its one JSON line.
function captureLog() {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => {
    expect(consoleError).toHaveBeenCalledTimes(1);
    return JSON.parse(consoleError.mock.calls[0][0]);
  };
}

describe('logError', () => {
  it('writes one JSON line with the message and fields', () => {
    const logged = captureLog();

    logError('Weekly review failed', { route: '/api/weekly-review', requestId: 'req-1' });

    expect(logged()).toMatchObject({
      level: 'error',
      message: 'Weekly review failed',
      route: '/api/weekly-review',
      requestId: 'req-1',
    });
  });

  it('includes an error with its stack', () => {
    const logged = captureLog();

    logError('Request failed', { error: new TypeError('fetch failed') });

    expect(logged().error).toMatchObject({
      name: 'TypeError',
      message: 'fetch failed',
      stack: expect.stringContaining('TypeError: fetch failed'),
    });
  });

  it("includes an error's cause, where Node puts the network detail", () => {
    const logged = captureLog();

    logError('Request failed', {
      error: new TypeError('fetch failed', { cause: new Error('ECONNREFUSED') }),
    });

    expect(logged().error.cause).toMatchObject({ message: 'ECONNREFUSED' });
  });

  it('keeps values that are not errors as they are', () => {
    const logged = captureLog();

    logError('Upstream error', { status: 403, detail: { message: 'forbidden' } });

    expect(logged()).toMatchObject({ status: 403, detail: { message: 'forbidden' } });
  });
});

describe('requestId', () => {
  it("uses Vercel's request id, so our logs match Vercel's request log", () => {
    const request = new Request('http://localhost/', { headers: { 'x-vercel-id': 'iad1::abc123' } });

    expect(requestId(request)).toBe('iad1::abc123');
  });

  it('makes one up when not running on Vercel', () => {
    const request = new Request('http://localhost/');

    expect(requestId(request)).toMatch(/^[0-9a-f-]{36}$/);
    expect(requestId(request)).not.toBe(requestId(request));
  });
});

describe('withErrorLogging', () => {
  it('passes through what the handler returns', async () => {
    const handler = withErrorLogging('/api/test', async () => Response.json({ ok: true }));

    const response = await handler(new Request('http://localhost/api/test'));

    expect(await response.json()).toEqual({ ok: true });
  });

  it('logs an uncaught error and answers 500 with the request id', async () => {
    const logged = captureLog();
    const handler = withErrorLogging('/api/test', async () => {
      throw new Error('connection terminated');
    });

    const response = await handler(
      new Request('http://localhost/api/test', { headers: { 'x-vercel-id': 'iad1::abc123' } })
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Something went wrong. Try again.',
      requestId: 'iad1::abc123',
    });
    expect(logged()).toMatchObject({
      message: 'Unhandled error',
      route: '/api/test',
      requestId: 'iad1::abc123',
      error: { message: 'connection terminated' },
    });
  });

  it("doesn't pass the error's details to the client", async () => {
    captureLog();
    const handler = withErrorLogging('/api/test', async () => {
      throw new Error('password authentication failed for user "parallax"');
    });

    const response = await handler(new Request('http://localhost/api/test'));

    expect(JSON.stringify(await response.json())).not.toContain('password');
  });
});
