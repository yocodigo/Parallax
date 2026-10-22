import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ErrorFallback from '../ErrorFallback';

afterEach(() => vi.restoreAllMocks());

const quietConsole = () => vi.spyOn(console, 'error').mockImplementation(() => {});

describe('ErrorFallback', () => {
  it('says something went wrong without showing the error itself', () => {
    quietConsole();

    render(<ErrorFallback error={new Error('Cannot read properties of undefined')} retry={() => {}} />);

    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument();
    expect(screen.queryByText(/cannot read properties/i)).not.toBeInTheDocument();
  });

  it("shows a server error's digest as the reference to find it in the logs", () => {
    quietConsole();
    const error = Object.assign(new Error('An error occurred in the Server Components render.'), {
      digest: '2512346789',
    });

    render(<ErrorFallback error={error} retry={() => {}} />);

    expect(screen.getByText('Reference: 2512346789')).toBeInTheDocument();
  });

  it('shows no reference for an error from the browser, which has no digest', () => {
    quietConsole();

    render(<ErrorFallback error={new Error('boom')} retry={() => {}} />);

    expect(screen.queryByText(/reference/i)).not.toBeInTheDocument();
  });

  it('tries again when asked', async () => {
    quietConsole();
    const retry = vi.fn();
    render(<ErrorFallback error={new Error('boom')} retry={retry} />);

    await userEvent.click(screen.getByRole('button', { name: /try again/i }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("logs the error to the browser console, where a browser error's details end up", () => {
    const consoleError = quietConsole();
    const error = new Error('boom');

    render(<ErrorFallback error={error} retry={() => {}} />);

    expect(consoleError).toHaveBeenCalledWith(error);
  });
});
