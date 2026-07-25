import { describe, it, expect } from 'vitest';
import { parseBarsParams } from '../params';

const sp = (obj) => new URLSearchParams(obj);

describe('parseBarsParams', () => {
  it('parses and normalizes symbols', () => {
    const r = parseBarsParams(sp({ symbols: 'aapl, msft ', timeframe: '1Day', days: '30' }));
    expect(r.success).toBe(true);
    expect(r.data.symbols).toEqual(['AAPL', 'MSFT']);
    expect(r.data.days).toBe(30);
  });

  it('rejects garbage symbols', () => {
    expect(parseBarsParams(sp({ symbols: '!!!' })).success).toBe(false);
  });

  it('defaults to daily, 90 days', () => {
    const r = parseBarsParams(sp({ symbols: 'AAPL' }));
    expect(r.data.timeframe).toBe('1Day');
    expect(r.data.days).toBe(90);
  });

  it('accepts every supported timeframe', () => {
    for (const tf of ['1Min', '5Min', '15Min', '30Min', '1Hour', '1Day', '1Week', '1Month']) {
      expect(parseBarsParams(sp({ symbols: 'AAPL', timeframe: tf, days: '1' })).success).toBe(true);
    }
  });

  it('rejects unsupported timeframes', () => {
    for (const tf of ['2Day', '60Min', 'banana']) {
      expect(parseBarsParams(sp({ symbols: 'AAPL', timeframe: tf })).success).toBe(false);
    }
  });

  it('clamps the window to the timeframe cap', () => {
    // 1Min caps at 5 days; a 90-day request clamps down.
    const r = parseBarsParams(sp({ symbols: 'AAPL', timeframe: '1Min', days: '90' }));
    expect(r.data.days).toBe(5);
  });

  it('leaves within-cap windows untouched', () => {
    const r = parseBarsParams(sp({ symbols: 'AAPL', timeframe: '1Day', days: '365' }));
    expect(r.data.days).toBe(365);
  });
});