// The public demo: fake data, no sign-in, nothing saved, no paid API calls.
// NEXT_PUBLIC_ so the browser sees it too. Set at build time, Next inlines it
// everywhere, so the server and the browser agree and changing it needs a
// rebuild. Unset at build time, the browser bundle reads it as undefined but
// the server reads it at runtime, so set it only when building the demo.
// Spelled out in full: Next only inlines a literal process.env.NEXT_PUBLIC_*.
export function isDemo() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}
