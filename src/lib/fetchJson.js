// The message to show for a failed API response. A server error comes with
// the request id it was logged under, shown as a reference so the matching
// log line can be found.
export function apiErrorMessage(json, fallback) {
  const message = json?.error || fallback;
  return json?.requestId ? `${message} (Reference: ${json.requestId})` : message;
}

// Fetcher for SWR: resolves to the JSON body, or throws the API's error
// message so components can show it.
export async function fetchJson(url) {
  const res = await fetch(url);
  // A timeout from the host can come back as an HTML page rather than JSON.
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(json, 'Request failed'));
  return json;
}
