import { describe, expect, it } from 'vitest';
import { cellColor } from '../CorrelationHeatmap';

describe('cellColor', () => {
  it('shades positive correlations green and negative ones red, from the theme', () => {
    expect(cellColor(0.5)).toBe('rgb(var(--color-green-600) / 0.225)');
    expect(cellColor(-0.5)).toBe('rgb(var(--color-red-600) / 0.225)');
  });

  it('is strongest at ±1 but stays light enough to read the number on it', () => {
    expect(cellColor(1)).toBe('rgb(var(--color-green-600) / 0.45)');
    expect(cellColor(-1)).toBe('rgb(var(--color-red-600) / 0.45)');
  });

  it('is clear at 0', () => {
    expect(cellColor(0)).toBe('rgb(var(--color-green-600) / 0)');
  });
});
