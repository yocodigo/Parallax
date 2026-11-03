import FidelityImport from '@/components/FidelityImport';
import ThinkorswimImport from '@/components/ThinkorswimImport';
import { isDemo } from '@/lib/demo';

export const metadata = {
  title: 'Import',
};

export default function ImportPage() {
  if (isDemo()) {
    return (
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold text-gray-900">Import</h1>
        <p className="mt-1 text-sm text-gray-500">
          Importing thinkorswim and Fidelity statements is turned off in the demo.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-12 px-6 py-10">
      <section>
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Import from thinkorswim</h1>
          <p className="mt-1 text-sm text-gray-500">
            In thinkorswim, open Monitor, then Account Statement, pick the dates, and choose Export to File.
            Option trades fill in matching trades in your journal; the rest are added. Importing the same
            dates again skips what was already imported.
          </p>
        </header>

        <ThinkorswimImport />
      </section>

      <section>
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-gray-900">Import from Fidelity</h1>
          <p className="mt-1 text-sm text-gray-500">
            On Fidelity.com, open Activity &amp; Orders, then History, pick the dates, and download as CSV.
            Stock trades fill in matching trades in your journal; the rest are added. The export has no
            time of day, so every fill reads as the New York open. Importing the same dates again skips
            what was already imported.
          </p>
        </header>

        <FidelityImport />
      </section>
    </main>
  );
}
