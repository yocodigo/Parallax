// The app's colors as CSS variables, so a theme can change them without
// touching the components' classes. Used by tailwind.config.js, which is
// CommonJS, hence this file's format.

const colors = require('tailwindcss/colors');

// The hues the components use. Others keep Tailwind's fixed colors.
const THEMED_HUES = ['gray', 'red', 'green', 'amber', 'blue'];

// "#6b7280" -> "107 114 128", the form rgb(var(--x) / <alpha-value>) needs.
// Short forms such as Tailwind's "#fff" are expanded first.
function channels(hex) {
  const digits = hex.length === 4 ? [...hex.slice(1)].map((d) => d + d).join('') : hex.slice(1);
  const n = parseInt(digits, 16);
  return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`;
}

// Variables for light mode: Tailwind's own colors, so it looks as before.
function lightVariables() {
  const variables = { '--color-white': channels(colors.white) };
  for (const hue of THEMED_HUES) {
    for (const [shade, hex] of Object.entries(colors[hue])) {
      variables[`--color-${hue}-${shade}`] = channels(hex);
    }
  }
  return variables;
}

// Each shade's opposite on the scale, so light text on a dark background
// keeps the contrast dark text had on a light one.
const OPPOSITE = { 50: 950, 100: 900, 200: 800, 300: 700, 400: 600, 500: 500, 600: 400, 700: 300, 800: 200, 900: 100, 950: 50 };

// gray-500 maps to itself, which leaves the most common secondary text at a
// contrast of 3.7 on dark cards. This mix of gray-500 and gray-400 gives 4.8,
// as gray-500 has on white.
const DARK_OVERRIDES = { 'gray-500': '#7f8693' };

// Variables for dark mode: each shade takes its opposite's color, and white
// (the card background) becomes gray-900, a step above the gray-950 page.
function darkVariables() {
  const variables = { '--color-white': channels(colors.gray[900]) };
  for (const hue of THEMED_HUES) {
    for (const shade of Object.keys(colors[hue])) {
      const name = `${hue}-${shade}`;
      variables[`--color-${name}`] = channels(DARK_OVERRIDES[name] ?? colors[hue][OPPOSITE[shade]]);
    }
  }
  return variables;
}

// Tailwind color settings that read the variables. <alpha-value> keeps
// opacity modifiers such as bg-blue-600/50 working.
function themedColors() {
  const variable = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;
  const themed = { white: variable('white') };
  for (const hue of THEMED_HUES) {
    themed[hue] = Object.fromEntries(Object.keys(colors[hue]).map((shade) => [shade, variable(`${hue}-${shade}`)]));
  }
  return themed;
}

module.exports = { THEMED_HUES, darkVariables, lightVariables, themedColors };
