import CircuitBreakers from '@/components/CircuitBreakers';
import RuleSettings from '@/components/RuleSettings';
import Strategies from '@/components/Strategies';

export const metadata = {
  title: 'Rules',
};

export default function RulesPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Rules</h1>
        <p className="mt-1 text-sm text-gray-500">
          The setups you trade, the limits you hold yourself to, and what each one checks. A plan that follows a
          strategy gets its rules as a checklist when you record the entry.
        </p>
      </header>

      <div className="space-y-6">
        <Strategies />
        <RuleSettings />
        <CircuitBreakers />
      </div>
    </main>
  );
}
