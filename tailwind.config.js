const plugin = require('tailwindcss/plugin');
const { lightVariables, themedColors } = require('./src/lib/palette.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // The hues the app uses read CSS variables (src/lib/palette.cjs).
      colors: themedColors(),
    },
  },
  plugins: [
    plugin(({ addBase }) => {
      addBase({ ':root': lightVariables() });
    }),
  ],
};
