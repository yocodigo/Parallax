import SignInForm from '@/components/SignInForm';
import { safeNextPath } from '@/lib/session';

export const metadata = {
  title: 'Sign in',
};

export default async function LoginPage({ searchParams }) {
  const { next } = await searchParams;

  return (
    <main className="mx-auto max-w-sm px-6 py-16">
      <h1 className="mb-6 text-2xl font-semibold text-gray-900">Sign in</h1>
      <SignInForm next={safeNextPath(next)} />
    </main>
  );
}
