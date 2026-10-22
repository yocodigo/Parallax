import MistakeLedger from '@/components/MistakeLedger';

export const metadata = {
  title: 'Insights',
};

export default function InsightsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Insights</h1>
        <p className="mt-1 text-sm text-gray-500">What your own trading history says, in R.</p>
      </header>

      <MistakeLedger />
    </main>
  );
}
