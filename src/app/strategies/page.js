import Strategies from '@/components/Strategies';

export const metadata = {
  title: 'Strategies',
};

export default function StrategiesPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Strategies</h1>
        <p className="mt-1 text-sm text-gray-500">
          The setups you trade and the rules each one requires. A plan that follows a strategy gets its
          rules as a checklist when you record the entry.
        </p>
      </header>

      <Strategies />
    </main>
  );
}
