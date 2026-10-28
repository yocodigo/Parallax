import { describe, expect, it } from 'vitest';
import { stopReport } from '../stopReport';

const run = (reason, r, t1Later = false) => ({ exitIndex: 0, exitPrice: 0, reason, r, t1Later });

describe('stopReport', () => {
  it('sums up one rule set over many trades', () => {
    const results = [run('t1', 2), run('S2', -1), run('S2', -1, true), run('close', 0.5)];
    expect(stopReport(results)).toEqual({
      trades: 4,
      averageR: 0.125,
      byReason: { t1: 1, S2: 2, close: 1 },
      cutBeforeT1: 1,
      cutBeforeT1ByReason: { S2: 1 },
      cutBeforeT1Share: 0.25,
      averageRWhenCut: -1,
    });
  });

  it('says which rule of a combination cut trades before T1', () => {
    const results = [run('S1', -0.5, true), run('S2', -1, true), run('S2', -1, true), run('S1', -0.4)];
    expect(stopReport(results).cutBeforeT1ByReason).toEqual({ S1: 1, S2: 2 });
  });

  it('leaves out trades without an R from the averages, not the counts', () => {
    const results = [run('S2', null, true), run('S2', -0.5, true), run('t1', 1.5)];
    expect(stopReport(results)).toMatchObject({ trades: 3, averageR: 0.5, cutBeforeT1: 2, averageRWhenCut: -0.5 });
  });

  it('gives blank averages when there is nothing to average', () => {
    expect(stopReport([run('close', null)])).toMatchObject({ averageR: null, cutBeforeT1: 0, averageRWhenCut: null });
    expect(stopReport([])).toEqual({
      trades: 0,
      averageR: null,
      byReason: {},
      cutBeforeT1: 0,
      cutBeforeT1ByReason: {},
      cutBeforeT1Share: null,
      averageRWhenCut: null,
    });
  });
});
