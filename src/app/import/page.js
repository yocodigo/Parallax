import ThinkorswimImport from '@/components/ThinkorswimImport';

export const metadata = {
  title: 'Import',
};

export default function ImportPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Import from thinkorswim</h1>
        <p className="mt-1 text-sm text-gray-500">
          In thinkorswim, open Monitor, then Account Statement, pick the dates, and choose Export to File.
          Option trades fill in matching trades in your journal; the rest are added. Importing the same
          dates again skips what was already imported.
        </p>
      </header>

      <ThinkorswimImport />
    </main>
  );
}
