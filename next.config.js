const nextConfig = {
  reactStrictMode: true,
  // Temporary while the pages are being regrouped (docs/ui-upgrades.md item 2).
  async redirects() {
    return [{ source: '/strategies', destination: '/rules', permanent: false }];
  },
};

module.exports = nextConfig;
