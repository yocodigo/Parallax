import { describe, expect, it } from 'vitest';
import { cellColor } from '../CorrelationHeatmap';

describe('cellColor', () => {
  it('is one blue from the theme, deeper the higher the correlation', () => {
    expect(cellColor(0.5)).toBe('rgb(var(--color-blue-600) / 0.338)');
    expect(cellColor(-0.5)).toBe('rgb(var(--color-blue-600) / 0.113)');
  });

  it('is strongest at 1 but stays light enough to read the number on it', () => {
    expect(cellColor(1)).toBe('rgb(var(--color-blue-600) / 0.45)');
  });

  it('fades to no tint at -1, and is halfway at 0', () => {
    expect(cellColor(-1)).toBe('rgb(var(--color-blue-600) / 0)');
    expect(cellColor(0)).toBe('rgb(var(--color-blue-600) / 0.225)');
  });
});
