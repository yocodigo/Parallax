import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import ThemePicker from '../ThemePicker';

const root = document.documentElement;

afterEach(() => {
  localStorage.clear();
  root.className = '';
});

describe('ThemePicker', () => {
  it('follows the system setting until you choose', () => {
    render(<ThemePicker />);
    expect(screen.getByLabelText('Theme')).toHaveValue('system');
    expect(root.className).toBe('');
  });

  it('switches to dark and remembers it', async () => {
    render(<ThemePicker />);
    await userEvent.selectOptions(screen.getByLabelText('Theme'), 'dark');

    expect(root.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem('theme')).toBe('dark');
  });

  it('goes back to following the system setting', async () => {
    render(<ThemePicker />);
    await userEvent.selectOptions(screen.getByLabelText('Theme'), 'light');
    await userEvent.selectOptions(screen.getByLabelText('Theme'), 'system');

    expect(root.className).toBe('');
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('starts from the saved choice', async () => {
    localStorage.setItem('theme', 'light');
    render(<ThemePicker />);
    expect(await screen.findByDisplayValue('Light')).toBeInTheDocument();
  });
});
