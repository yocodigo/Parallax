import { describe, expect, it } from 'vitest';
import { parseVixCsv, vixBefore } from '../vix';

const CSV = `DATE,OPEN,HIGH,LOW,CLOSE
10/13/2026,15.000000,15.500000,14.800000,15.000000
10/14/2026,15.100000,15.900000,15.000000,15.400000
10/15/2026,15.400000,16.200000,15.300000,16.000000
10/16/2026,16.000000,16.900000,15.900000,16.500000
10/19/2026,16.500000,17.400000,16.400000,17.000000
10/20/2026,18.420000,19.130000,17.250000,17.310000
10/21/2026,17.250000,17.580000,16.510000,16.680000
`;

describe('parseVixCsv', () => {
  it("reads Cboe's daily history into dated closes", () => {
    expect(parseVixCsv(CSV).slice(-2)).toEqual([
      { date: '2026-10-20', close: 17.31 },
      { date: '2026-10-21', close: 16.68 },
    ]);
  });

  it('skips lines it cannot read', () => {
    expect(parseVixCsv('DATE,OPEN,HIGH,LOW,CLOSE\nnot,a,row\n\n')).toEqual([]);
  });
});

describe('vixBefore', () => {
  const rows = parseVixCsv(CSV);

  it('gives the previous close, with its direction over five sessions', () => {
    // 16.68 on Oct 21 against 15.40 on Oct 14: up 8%.
    expect(vixBefore(rows, '2026-10-22')).toEqual({ close: 16.68, date: '2026-10-21', direction: 'rising' });
  });

  it('never uses the entry day’s own close, which came after the entry', () => {
    expect(vixBefore(rows, '2026-10-21').date).toBe('2026-10-20');
  });

  it('calls a small change flat', () => {
    const flat = rows.map((row) => ({ ...row, close: 16 }));

    expect(vixBefore(flat, '2026-10-22').direction).toBe('flat');
  });

  it('is null without an earlier close', () => {
    expect(vixBefore(rows, '2026-10-13')).toBeNull();
  });
});
