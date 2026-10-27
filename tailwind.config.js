const plugin = require('tailwindcss/plugin');
const { darkVariables, lightVariables, themedColors } = require('./src/lib/palette.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Without this, Tailwind can't read a variable-based default ring color and
  // falls back to its own light blue.
  future: { respectDefaultRingColorOpacity: true },
  theme: {
    extend: {
      // The hues the app uses read CSS variables (src/lib/palette.cjs).
      colors: themedColors(),
      ringColor: { DEFAULT: 'rgb(var(--color-blue-500) / 0.5)' },
    },
  },
  plugins: [
    // Light colors by default; dark ones when the system is set to dark,
    // unless the theme picker chose light, or when it chose dark (classes on
    // <html>, src/lib/theme.js). color-scheme gives form controls and
    // scrollbars the matching look.
    plugin(({ addBase }) => {
      const dark = { ...darkVariables(), colorScheme: 'dark' };
      addBase({
        ':root': { ...lightVariables(), colorScheme: 'light' },
        '@media (prefers-color-scheme: dark)': { ':root:not(.light)': dark },
        ':root.dark': dark,
      });
    }),
  ],
};
