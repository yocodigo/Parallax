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

describe('SiteNav', () => {
  it('links to the dashboard, the journal, strategies, insights, and the import', () => {
    usePathname.mockReturnValue('/');
    render(<SiteNav />);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Journal' })).toHaveAttribute('href', '/journal');
    expect(screen.getByRole('link', { name: 'Strategies' })).toHaveAttribute('href', '/strategies');
    expect(screen.getByRole('link', { name: 'Insights' })).toHaveAttribute('href', '/insights');
    expect(screen.getByRole('link', { name: 'Import' })).toHaveAttribute('href', '/import');
  });

  it('offers a theme picker', () => {
    usePathname.mockReturnValue('/');
    render(<SiteNav />);

    expect(screen.getByLabelText('Theme')).toBeInTheDocument();
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

    await userEvent.setup().click(screen.getByRole('button', { name: 'Sign out' }));

    await vi.waitFor(() => expect(router.replace).toHaveBeenCalledWith('/login'));
    expect(router.refresh).toHaveBeenCalled();
    expect(deletes).toHaveLength(1);
  });

  it('shows only the theme picker on the login page', () => {
    usePathname.mockReturnValue('/login');
    render(<SiteNav />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Theme')).toBeInTheDocument();
  });
});
