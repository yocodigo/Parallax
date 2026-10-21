// Fetcher for SWR: resolves to the JSON body, or throws the API's error
// message so components can show it.
export async function fetchJson(url) {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}
