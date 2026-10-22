// Server-side logging: one JSON line per event, so a log viewer (Vercel's,
// or a terminal piped through jq) can filter by route, request id, or error.

// Errors don't survive JSON.stringify (it gives {}), so spell out the parts
// that help debug. Node puts the network detail of a failed fetch in `cause`.
function serializeError(error, depth = 0) {
  if (!(error instanceof Error)) return error;
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause !== undefined && depth < 3 && { cause: serializeError(error.cause, depth + 1) }),
  };
}

export function logError(message, { error, ...fields } = {}) {
  console.error(
    JSON.stringify({
      level: 'error',
      time: new Date().toISOString(),
      message,
      ...fields,
      ...(error !== undefined && { error: serializeError(error) }),
    })
  );
}

// Ties a log line to the error the user saw. On Vercel this is the id its own
// request log shows; locally, a fresh one per request.
export function requestId(request) {
  return request.headers.get('x-vercel-id') ?? crypto.randomUUID();
}

// Wraps a route handler so an error nobody caught (the database is down, a
// bug in our own code) is logged and answered with JSON the forms can show,
// instead of Next's default error page. The details stay in the log.
export function withErrorLogging(route, handler) {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      const id = requestId(request);
      logError('Unhandled error', { route, requestId: id, error });
      return Response.json({ error: 'Something went wrong. Try again.', requestId: id }, { status: 500 });
    }
  };
}
