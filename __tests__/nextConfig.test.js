// @vitest-environment node
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const nextConfig = createRequire(import.meta.url)('../next.config.js');

describe('next.config redirects', () => {
  it('sends the old Strategies page to Rules', async () => {
    const redirects = await nextConfig.redirects();

    expect(redirects).toContainEqual({ source: '/strategies', destination: '/rules', permanent: false });
  });
});
