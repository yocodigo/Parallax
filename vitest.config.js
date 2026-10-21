import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          globals: true,
          setupFiles: ['./vitest.setup.js'],
          exclude: [...configDefaults.exclude, '**/*.db.test.js'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          include: ['src/**/*.db.test.js'],
          globalSetup: ['./src/db/__tests__/global-setup.js'],
          // Database test files share one database, so they run one at a time
          // instead of truncating each other's data. Each file still gets its
          // own modules, and with them its own connection pool.
          fileParallelism: false,
        },
      },
    ],
  },
});