// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logError, requestId } from '../log';

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
