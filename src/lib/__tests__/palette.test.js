import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import colors from 'tailwindcss/colors';
import { describe, expect, it } from 'vitest';
import { darkVariables, lightVariables, THEMED_HUES, themedColors } from '../palette.cjs';

// "#6b7280" -> "107 114 128", the form rgb(var(--x) / <alpha-value>) needs.
const channels = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${n >> 16} ${(n >> 8) & 255} ${n & 255}`;
};

describe('lightVariables', () => {
  it("gives every shade of the themed hues Tailwind's own color, so light mode looks the same", () => {
    const variables = lightVariables();
    for (const hue of THEMED_HUES) {
      for (const [shade, hex] of Object.entries(colors[hue])) {
        expect(variables[`--color-${hue}-${shade}`]).toBe(channels(hex));
      }
    }
  });

  it('keeps white white', () => {
    expect(lightVariables()['--color-white']).toBe('255 255 255');
  });
});

describe('themedColors', () => {
  it('points each themed class at its variable, keeping opacity modifiers working', () => {
    const themed = themedColors();
    expect(themed.gray[500]).toBe('rgb(var(--color-gray-500) / <alpha-value>)');
    expect(themed.blue[600]).toBe('rgb(var(--color-blue-600) / <alpha-value>)');
    expect(themed.white).toBe('rgb(var(--color-white) / <alpha-value>)');
  });
});

// WCAG contrast between two "r g b" strings: 4.5 is the minimum for text.
function contrast(a, b) {
  const luminance = (rgb) =>
    rgb
      .split(' ')
      .map((v) => {
        const c = Number(v) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      })
      .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

describe('darkVariables', () => {
  it('swaps each shade with its opposite on the scale', () => {
    const dark = darkVariables();
    expect(dark['--color-red-50']).toBe(channels(colors.red[950]));
    expect(dark['--color-blue-600']).toBe(channels(colors.blue[400]));
    expect(dark['--color-gray-900']).toBe(channels(colors.gray[100]));
  });

  it('makes white the dark card color, a step above the gray-950 page', () => {
    expect(darkVariables()['--color-white']).toBe(channels(colors.gray[900]));
    expect(darkVariables()['--color-gray-50']).toBe(channels(colors.gray[950]));
  });

  // Text and background pairs the components use.
  const pairs = [
    ['gray-500', 'white'],
    ['gray-500', 'gray-50'],
    ['gray-600', 'white'],
    ['gray-700', 'white'],
    ['gray-800', 'white'],
    ['gray-900', 'gray-50'],
    ['red-600', 'white'],
    ['red-700', 'white'],
    ['red-800', 'red-50'],
    ['amber-900', 'amber-50'],
    ['green-700', 'white'],
    ['blue-700', 'white'],
    ['white', 'blue-600'],
    ['white', 'gray-800'],
  ];

  it.each(pairs)('keeps %s on %s readable when it is readable in light mode', (text, background) => {
    const [light, dark] = [lightVariables(), darkVariables()];
    const variable = (name) => `--color-${name}`;
    expect(contrast(light[variable(text)], light[variable(background)])).toBeGreaterThanOrEqual(4.5);
    expect(contrast(dark[variable(text)], dark[variable(background)])).toBeGreaterThanOrEqual(4.5);
  });
});

// Classes in other hues keep Tailwind's fixed colors and wouldn't change in
// dark mode, so components stick to the themed ones.
describe('component colors', () => {
  const files = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
      return /\.(js|jsx)$/.test(name) ? [path] : [];
    });

  it('use only the themed hues', () => {
    const hues = Object.keys(colors).filter((hue) => typeof colors[hue] === 'object');
    const pattern = new RegExp(`\\b(?:bg|text|border|divide|ring|fill|stroke|from|to|outline|placeholder)-(${hues.join('|')})-\\d+`, 'g');
    const strays = files('src').flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(pattern)]
        .filter((match) => !THEMED_HUES.includes(match[1]))
        .map((match) => `${path}: ${match[0]}`)
    );
    expect(strays).toEqual([]);
  });
});
