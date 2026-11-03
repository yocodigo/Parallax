import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useRouter } from 'next/navigation';
import { server } from '@/mocks/server';
import LoginPage from '../page';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));

const router = { replace: vi.fn(), refresh: vi.fn() };

beforeEach(() => {
  router.replace.mockReset();
  useRouter.mockReturnValue(router);
  server.use(http.post('*/api/session', () => HttpResponse.json({ signedIn: true })));
});

// The page is what applies safeNextPath to the query, so check it end to end.
async function signInFrom(next) {
  render(await LoginPage({ searchParams: Promise.resolve({ next }) }));
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Password'), 'correct horse');
  await user.click(screen.getByRole('button', { name: /sign in/i }));
  await vi.waitFor(() => expect(router.replace).toHaveBeenCalled());
}

describe('LoginPage', () => {
  it('goes on to the page that was asked for', async () => {
    await signInFrom('/journal?mode=live');

    expect(router.replace).toHaveBeenCalledWith('/journal?mode=live');
  });

  it('goes to the dashboard rather than to another site', async () => {
    await signInFrom('//evil.example/');

    expect(router.replace).toHaveBeenCalledWith('/');
  });
});
