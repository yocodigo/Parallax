import PerformanceDashboard from '@/components/PerformanceDashboard';

export const metadata = {
  title: 'Performance',
};

export default function PerformancePage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Performance</h1>
        <p className="mt-1 text-sm text-gray-500">How the trades have done, in dollars, by year.</p>
      </header>

      <PerformanceDashboard />
    </main>
  );
}
