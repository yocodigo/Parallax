import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import SiteNav from '../SiteNav';

vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));

describe('SiteNav', () => {
  it('links to the dashboard and the journal', () => {
    usePathname.mockReturnValue('/');
    render(<SiteNav />);

    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: 'Journal' })).toHaveAttribute('href', '/journal');
  });

  it('marks the page you are on', () => {
    usePathname.mockReturnValue('/journal');
    render(<SiteNav />);

    expect(screen.getByRole('link', { name: 'Journal' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });
});
