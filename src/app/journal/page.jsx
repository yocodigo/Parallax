import JournalEntries from '@/components/JournalEntries';
import NewEntry from '@/components/NewEntry';
import WeeklyReview from '@/components/WeeklyReview';
import { isDemo } from '@/lib/demo';

export const metadata = {
  title: 'Journal',
};

export default function JournalPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Journal</h1>
          <p className="mt-1 text-sm text-gray-500">
            Trade plans, reviews, and investment theses, newest first.
          </p>
        </div>
        {!isDemo() && <NewEntry />}
      </header>

      {isDemo() ? (
        <p className="mb-8 text-sm text-gray-500">
          Logging plans and reviews, voice notes, and the weekly review are turned off in the demo.
        </p>
      ) : (
        <div className="mb-8">
          <WeeklyReview />
        </div>
      )}

      <JournalEntries />
    </main>
  );
}
