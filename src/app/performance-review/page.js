import PerformanceReview from '@/components/PerformanceReview';

export const metadata = {
  title: 'Performance Review',
};

export default function PerformanceReviewPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Performance Review</h1>
        <p className="mt-1 text-sm text-gray-500">
          A coach’s read of your trades and journal over a stretch of time: what is working, what repeats, and what to do next.
        </p>
      </header>

      <PerformanceReview />
    </main>
  );
}
