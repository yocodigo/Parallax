import { logError } from '@/lib/log';

// Next calls this for server errors nothing else caught, such as a page that
// throws while rendering. Route handlers catch their own (withErrorLogging),
// so this is the backstop for everything else, logged in the same format.
export function onRequestError(error, request, context) {
  const vercelId = request.headers['x-vercel-id'];

  logError('Unhandled server error', {
    route: context.routePath,
    routeType: context.routeType,
    method: request.method,
    path: request.path,
    requestId: Array.isArray(vercelId) ? vercelId[0] : vercelId,
    // React hides a render error's details from the browser and shows this
    // digest instead; the error page displays it, so it finds this line.
    digest: error?.digest,
    error,
  });
}
