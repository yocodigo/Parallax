import Today from '@/components/Today';

export const metadata = {
  title: 'Today',
};

// The day picker starts on, and stops at, today's New York date, so the page
// is built per request: prerendered, it would keep the build's date.
export const dynamic = 'force-dynamic';

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Today</h1>
        <p className="mt-1 text-sm text-gray-500">
          The day&apos;s loop: plan, import, review each trade, then read the coaching. Days are New York trading days.
        </p>
      </header>

      <Today />
    </main>
  );
}
