// The public demo: fake data, no sign-in, nothing saved, no paid API calls.
// NEXT_PUBLIC_ so the browser sees it too; Next inlines it at build time, so
// the server and the client can't disagree, and changing it needs a rebuild.
// Spelled out in full: Next only inlines a literal process.env.NEXT_PUBLIC_*.
export function isDemo() {
  return process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
}
