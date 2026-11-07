import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { usePathname, useRouter } from 'next/navigation';
import { server } from '@/mocks/server';
import SiteNav from '../SiteNav';

vi.mock('next/navigation', () => ({ usePathname: vi.fn(), useRouter: vi.fn() }));

const router = { replace: vi.fn(), refresh: vi.fn() };

beforeEach(() => {
  router.replace.mockReset();
  router.refresh.mockReset();
  useRouter.mockReturnValue(router);
});

// Theme and Sign out sit in a small menu behind the gear in the corner.
async function openSettings(user = userEvent.setup()) {
  await user.click(screen.getByRole('button', { name: 'Settings' }));
  return user;
}

describe('SiteNav', () => {
  it('links to the dashboard, the journal, strategies, performance, insights, and the import', () => {
    usePathname.mockReturnValue('/');
    render(<SiteNav />);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/dashboard');
    expect(screen.getByRole('link', { name: 'Journal' })).toHaveAttribute('href', '/journal');
    expect(screen.getByRole('link', { name: 'Strategies' })).toHaveAttribute('href', '/strategies');
    expect(screen.getByRole('link', { name: 'Performance' })).toHaveAttribute('href', '/performance');
    expect(screen.getByRole('link', { name: 'Insights' })).toHaveAttribute('href', '/insights');
    expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute('href', '/import');
  });

  it('keeps the theme picker and Sign out out of the bar until the settings gear is opened', async () => {
    usePathname.mockReturnValue('/');
    render(<SiteNav />);

    expect(screen.queryByLabelText('Theme')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-expanded', 'false');

    await openSettings();

    expect(screen.getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Theme')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });

  it('closes the settings with the gear, Escape, or a click elsewhere', async () => {
    usePathname.mockReturnValue('/');
    render(<SiteNav />);
    const user = await openSettings();

    await user.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.queryByLabelText('Theme')).not.toBeInTheDocument();

    await openSettings(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('Theme')).not.toBeInTheDocument();

    await openSettings(user);
    await user.click(screen.getByRole('link', { name: 'Journal' }));
    expect(screen.queryByLabelText('Theme')).not.toBeInTheDocument();
  });

  it('marks the page you are on', () => {
    usePathname.mockReturnValue('/journal');
    render(<SiteNav />);

    expect(screen.getByRole('link', { name: 'Journal' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('signs out and goes to the login page', async () => {
    const deletes = [];
    server.use(
      http.delete('*/api/session', ({ request }) => {
        deletes.push(request);
        return HttpResponse.json({ signedIn: false });
      })
    );
    usePathname.mockReturnValue('/journal');
    render(<SiteNav />);

    const user = await openSettings();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(router.refresh).toHaveBeenCalled();
    expect(deletes).toHaveLength(1);
  });

  it('stays put and says so when signing out fails, since the session is still live', async () => {
    server.use(http.delete('*/api/session', () => HttpResponse.json({ error: 'Down' }, { status: 500 })));
    usePathname.mockReturnValue('/journal');
    render(<SiteNav />);

    const user = await openSettings();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText(/couldn't sign out/i)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('stays put when the server cannot be reached', async () => {
    server.use(http.delete('*/api/session', () => HttpResponse.error()));
    usePathname.mockReturnValue('/journal');
    render(<SiteNav />);

    const user = await openSettings();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));

    expect(await screen.findByText(/couldn't sign out/i)).toBeInTheDocument();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('offers only the theme picker on the login page', async () => {
    usePathname.mockReturnValue('/login');
    render(<SiteNav />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    await openSettings();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Theme')).toBeInTheDocument();
  });
});
