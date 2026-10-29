import { describe, expect, it } from 'vitest';
import { isSweep } from '../sweep';

const bar = (o, h, l, c) => ({ o, h, l, c });

describe('isSweep', () => {
  it('is a bar trading below support and closing back above it', () => {
    const bars = [bar(100.2, 100.3, 99.8, 100.1)];
    expect(isSweep(bars, 100, 'support', 0)).toBe(true);
  });

  it('is a bar trading above resistance and closing back below it', () => {
    const bars = [bar(99.8, 100.2, 99.7, 99.9)];
    expect(isSweep(bars, 100, 'resistance', 0)).toBe(true);
  });

  it('is false when the bar never trades beyond the level', () => {
    const bars = [bar(100.1, 100.3, 100, 100.2)];
    expect(isSweep(bars, 100, 'support', 0)).toBe(false);
  });

  it('is false when the close stays beyond the level: that is a break, not a sweep', () => {
    const bars = [bar(100.1, 100.2, 99.8, 99.9)];
    expect(isSweep(bars, 100, 'support', 0)).toBe(false);
  });

  it('counts a close exactly on the level as back on the original side', () => {
    const bars = [bar(100.1, 100.2, 99.8, 100)];
    expect(isSweep(bars, 100, 'support', 0)).toBe(true);
  });

  it('only reads the bar at index k, ignoring bars after it', () => {
    const bars = [bar(100.2, 100.3, 99.8, 100.1), bar(100.1, 100.4, 100, 100.3)];
    expect(isSweep(bars, 100, 'support', 0)).toBe(true);
  });
});
