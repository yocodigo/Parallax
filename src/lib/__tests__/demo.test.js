import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDemo } from '../demo';

afterEach(() => vi.unstubAllEnvs());

describe('isDemo', () => {
  it('is on only when NEXT_PUBLIC_DEMO_MODE is "true"', () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true');
    expect(isDemo()).toBe(true);

    for (const value of ['', 'false', '1', 'TRUE']) {
      vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', value);
      expect(isDemo()).toBe(false);
    }
  });
});
