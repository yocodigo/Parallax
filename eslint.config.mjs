import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import globals from 'globals';

export default defineConfig([
  ...nextVitals,
  {
    // eslint-config-next leaves no-undef off, expecting TypeScript to catch
    // undefined names. This project is JavaScript, so ESLint has to.
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { 'no-undef': 'error' },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'coverage/**']),
]);
