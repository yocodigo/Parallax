import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NewEntry from '../NewEntry';

// Stand-ins, so this checks only the drawer. Each has an input, to show a
// half-typed form survives switching tabs, and the plan and review ones a save.
const { stub } = vi.hoisted(() => ({
  stub: (name) =>
    function Stub({ onSaved }) {
      return (
        <div>
          <label>
            {name} notes
            <input />
          </label>
          {onSaved && <button onClick={() => onSaved({})}>Save {name}</button>}
        </div>
      );
    },
}));
vi.mock('../VoiceNote', () => ({ default: stub('voice') }));
vi.mock('../DailyPlanForm', () => ({ default: stub('daily plan') }));
vi.mock('../PlanForm', () => ({ default: stub('plan') }));
vi.mock('../ReviewForm', () => ({ default: stub('review') }));

const open = async (user) => {
  await user.click(screen.getByRole('button', { name: 'New entry' }));
  return screen.getByRole('dialog', { name: 'New entry' });
};

describe('NewEntry', () => {
  it('stays closed until the button is pressed', () => {
    render(<NewEntry />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'voice notes' })).not.toBeInTheDocument();
  });

  it('opens on the voice note, with a tab for each kind of entry', async () => {
    const user = userEvent.setup();
    render(<NewEntry />);
    await open(user);

    const tabs = screen.getAllByRole('tab').map((tab) => tab.textContent);
    expect(tabs).toEqual(['Voice note', 'Daily plan', 'Log a plan', 'Log a review']);
    expect(screen.getByRole('tab', { name: 'Voice note' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'voice notes' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'plan notes' })).not.toBeInTheDocument();
  });

  it('switches forms by tab and keeps what was typed', async () => {
    const user = userEvent.setup();
    render(<NewEntry />);
    await open(user);

    await user.click(screen.getByRole('tab', { name: 'Log a plan' }));
    await user.type(screen.getByRole('textbox', { name: 'plan notes' }), 'SPY calls');
    await user.click(screen.getByRole('tab', { name: 'Log a review' }));
    expect(screen.getByRole('textbox', { name: 'review notes' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'plan notes' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Log a plan' }));
    expect(screen.getByRole('textbox', { name: 'plan notes' })).toHaveValue('SPY calls');
  });

  it('closes with Escape or the close button, returning focus to the button', async () => {
    const user = userEvent.setup();
    render(<NewEntry />);

    await open(user);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New entry' })).toHaveFocus();

    await open(user);
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes on a click outside, keeping a draft for when it reopens', async () => {
    const user = userEvent.setup();
    render(<NewEntry />);

    const dialog = await open(user);
    await user.click(screen.getByRole('tab', { name: 'Log a plan' }));
    await user.type(screen.getByRole('textbox', { name: 'plan notes' }), 'QQQ puts');
    // The backdrop is the dialog's sibling, hidden from assistive tech.
    await user.click(dialog.previousElementSibling);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New entry' })).toHaveFocus();

    await open(user);
    expect(screen.getByRole('tab', { name: 'Log a plan' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('textbox', { name: 'plan notes' })).toHaveValue('QQQ puts');
  });

  it('closes once a plan or a review is saved, so the list shows it', async () => {
    const user = userEvent.setup();
    render(<NewEntry />);

    await open(user);
    await user.click(screen.getByRole('tab', { name: 'Log a plan' }));
    await user.click(screen.getByRole('button', { name: 'Save plan' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await open(user);
    await user.click(screen.getByRole('tab', { name: 'Log a review' }));
    await user.click(screen.getByRole('button', { name: 'Save review' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
