import PriceChart from '@/components/PriceChart';
import PortfolioRisk from '@/components/PortfolioRisk';
import { isDemo } from '@/lib/demo';

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          Parallax
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Daily price history pulled from the Alpaca Market Data API.
        </p>
      </header>

      <PriceChart />
      {/* The trading account's live positions; never shown in the public demo. */}
      {!isDemo() && (
        <div className="mt-8">
          <PortfolioRisk />
        </div>
      )}
    </main>
  );
}
