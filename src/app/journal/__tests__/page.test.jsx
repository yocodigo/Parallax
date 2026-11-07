import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import JournalPage from '../page';

// Stand-ins, so this checks only which parts the page shows.
vi.mock('@/components/JournalEntries', () => ({ default: () => <p>journal entries</p> }));
vi.mock('@/components/NewEntry', () => ({ default: () => <p>new entry</p> }));
vi.mock('@/components/WeeklyReview', () => ({ default: () => <p>weekly review</p> }));

afterEach(() => vi.unstubAllEnvs());

// The entry forms live in the New entry drawer, not on the page.
const FORMS = ['new entry', 'weekly review'];

describe('JournalPage', () => {
  it('shows the new-entry button, the weekly review, and the entries', () => {
    render(<JournalPage />);

    for (const text of [...FORMS, 'journal entries']) expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('shows only the entries in the demo', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
    render(<JournalPage />);

    expect(screen.getByText('journal entries')).toBeInTheDocument();
    for (const text of FORMS) expect(screen.queryByText(text)).not.toBeInTheDocument();
    expect(screen.getByText(/in the demo/i)).toBeInTheDocument();
  });
});
