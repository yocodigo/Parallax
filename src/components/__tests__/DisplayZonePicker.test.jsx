import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import DisplayZonePicker from '../DisplayZonePicker';
import { setDisplayZone } from '../useDisplayZone';

afterEach(() => {
  localStorage.clear();
  setDisplayZone('America/Los_Angeles');
  localStorage.clear();
});

describe('DisplayZonePicker', () => {
  it('shows Pacific until you choose', () => {
    render(<DisplayZonePicker />);
    expect(screen.getByLabelText('Times')).toHaveValue('America/Los_Angeles');
  });

  it('switches zone and remembers it', async () => {
    render(<DisplayZonePicker />);
    await userEvent.selectOptions(screen.getByLabelText('Times'), 'America/New_York');

    expect(screen.getByLabelText('Times')).toHaveValue('America/New_York');
    expect(localStorage.getItem('displayZone')).toBe('America/New_York');
  });

  it('starts from the saved zone', () => {
    localStorage.setItem('displayZone', 'America/Chicago');
    render(<DisplayZonePicker />);
    expect(screen.getByLabelText('Times')).toHaveValue('America/Chicago');
  });
});
