import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useRouter } from 'next/navigation';
import { server } from '@/mocks/server';
import SignInForm from '../SignInForm';

vi.mock('next/navigation', () => ({ useRouter: vi.fn() }));

const router = { replace: vi.fn(), refresh: vi.fn() };

function serveSignIn(response) {
  const bodies = [];
  server.use(
    http.post('*/api/session', async ({ request }) => {
      bodies.push(await request.json());
      return response();
    })
  );
  return bodies;
}

async function submit(password) {
  const user = userEvent.setup();
  if (password) await user.type(screen.getByLabelText('Password'), password);
  await user.click(screen.getByRole('button', { name: /sign in/i }));
}

beforeEach(() => {
  router.replace.mockReset();
  router.refresh.mockReset();
  useRouter.mockReturnValue(router);
});

describe('SignInForm', () => {
  it('signs in and goes on to the page that was asked for', async () => {
    const bodies = serveSignIn(() => HttpResponse.json({ signedIn: true }));
    render(<SignInForm next="/journal" />);

    await submit('correct horse');

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/journal'));
    expect(router.refresh).toHaveBeenCalled();
    expect(bodies).toEqual([{ password: 'correct horse' }]);
  });

  it('shows a wrong password and stays put', async () => {
    serveSignIn(() => HttpResponse.json({ error: 'Wrong password.' }, { status: 401 }));
    render(<SignInForm next="/" />);

    await submit('guess');

    expect(await screen.findByText('Wrong password.')).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
  });

  it('shows the lockout message', async () => {
    serveSignIn(() =>
      HttpResponse.json({ error: 'Too many wrong passwords. Try again in 15 minutes.' }, { status: 429 })
    );
    render(<SignInForm next="/" />);

    await submit('guess');

    expect(await screen.findByText(/too many wrong passwords/i)).toBeInTheDocument();
  });

  it("shows the server's field error under the password", async () => {
    serveSignIn(() =>
      HttpResponse.json(
        { error: 'Invalid sign-in', fieldErrors: { password: ['Enter the password'] } },
        { status: 400 }
      )
    );
    render(<SignInForm next="/" />);

    await submit();

    expect(await screen.findByText('Enter the password')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows a server error with its reference', async () => {
    serveSignIn(() =>
      HttpResponse.json({ error: 'Something went wrong. Try again.', requestId: 'req-1' }, { status: 500 })
    );
    render(<SignInForm next="/" />);

    await submit('correct horse');

    expect(await screen.findByText(/something went wrong.*\(Reference: req-1\)/i)).toBeInTheDocument();
  });
});
