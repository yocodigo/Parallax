import colors from 'tailwindcss/colors';
import { describe, expect, it } from 'vitest';
import { lightVariables, THEMED_HUES, themedColors } from '../palette.cjs';

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

  it('covers the hues the components use', () => {
    expect(THEMED_HUES).toEqual(['gray', 'red', 'green', 'amber', 'blue']);
  });
});
