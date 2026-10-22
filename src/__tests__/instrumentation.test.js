// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureErrorLogs } from '@/mocks/logs';
import { onRequestError } from '../instrumentation';

afterEach(() => vi.restoreAllMocks());

const request = {
  path: '/journal?tab=plans',
  method: 'GET',
  headers: { 'x-vercel-id': 'iad1::abc123' },
};

const context = {
  routerKind: 'App Router',
  routePath: '/journal',
  routeType: 'render',
  renderSource: 'server-rendering',
  revalidateReason: undefined,
};

describe('onRequestError', () => {
  it('logs an uncaught server error with its route and request id', () => {
    const logs = captureErrorLogs();

    onRequestError(new Error('relation "journal_entries" does not exist'), request, context);

    expect(logs()).toEqual([
      expect.objectContaining({
        message: 'Unhandled server error',
        route: '/journal',
        routeType: 'render',
        method: 'GET',
        path: '/journal?tab=plans',
        requestId: 'iad1::abc123',
        error: expect.objectContaining({ message: 'relation "journal_entries" does not exist' }),
      }),
    ]);
  });

  it("logs the digest React shows the browser in place of a render error's details", () => {
    const logs = captureErrorLogs();
    const error = Object.assign(new Error('An error occurred in the Server Components render.'), {
      digest: '2512346789',
    });

    onRequestError(error, request, context);

    expect(logs()[0]).toMatchObject({ digest: '2512346789' });
  });

  it('logs without a request id when not running on Vercel', () => {
    const logs = captureErrorLogs();

    onRequestError(new Error('boom'), { ...request, headers: {} }, context);

    expect(logs()[0].requestId).toBeUndefined();
  });
});
