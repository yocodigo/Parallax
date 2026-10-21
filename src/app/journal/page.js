import JournalEntries from '@/components/JournalEntries';
import PlanForm from '@/components/PlanForm';
import ReviewForm from '@/components/ReviewForm';
import VoiceNote from '@/components/VoiceNote';

export const metadata = {
  title: 'Journal',
};

export default function JournalPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Journal</h1>
        <p className="mt-1 text-sm text-gray-500">
          Trade plans, reviews, and investment theses, newest first.
        </p>
      </header>

      <div className="mb-8 space-y-6">
        <VoiceNote />
        <PlanForm />
        <ReviewForm />
      </div>

      <JournalEntries />
    </main>
  );
}
