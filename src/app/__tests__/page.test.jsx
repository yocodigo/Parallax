import { describe, expect, it, vi } from 'vitest';
import { redirect } from 'next/navigation';
import Home from '../page';

vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

describe('Home', () => {
  it('sends the landing page to the performance dashboard', () => {
    Home();

    expect(redirect).toHaveBeenCalledWith('/performance');
  });
});
