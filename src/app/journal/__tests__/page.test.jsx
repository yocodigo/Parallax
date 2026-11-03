import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import JournalPage from '../page';

// Stand-ins, so this checks only which parts the page shows.
vi.mock('@/components/DailyPlanForm', () => ({ default: () => <p>daily plan form</p> }));
vi.mock('@/components/JournalEntries', () => ({ default: () => <p>journal entries</p> }));
vi.mock('@/components/PlanForm', () => ({ default: () => <p>plan form</p> }));
vi.mock('@/components/ReviewForm', () => ({ default: () => <p>review form</p> }));
vi.mock('@/components/VoiceNote', () => ({ default: () => <p>voice note</p> }));
vi.mock('@/components/WeeklyReview', () => ({ default: () => <p>weekly review</p> }));

afterEach(() => vi.unstubAllEnvs());

const FORMS = ['weekly review', 'voice note', 'daily plan form', 'plan form', 'review form'];

describe('JournalPage', () => {
  it('shows the forms and the entries', () => {
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
