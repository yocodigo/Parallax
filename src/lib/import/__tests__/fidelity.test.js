import { describe, expect, it } from 'vitest';
import { parseFidelityHistory } from '../fidelity';

// A Fidelity "History for Account" export, trimmed to the parts the import
// reads, with made-up fills. Negative quantities and amounts come quoted
// ("-10"), positive ones don't; commission and fees are blank when there
// are none.
const history = (rows) =>
  [
    '',
    '',
    'Run Date,Action,Symbol,Description,Type,Price ($),Quantity,Commission ($),Fees ($),Accrued Interest ($),Amount ($),Cash Balance ($),Settlement Date',
    ...rows,
    '',
    'The data and information in this spreadsheet is provided to you solely for your use and is not for distribution.',
    '',
    'Date downloaded 10/29/2026 11:29 am',
  ].join('\n');

const BUY = '10/09/2026,YOU BOUGHT WIDGET CO COM (WDGT) (Margin),WDGT,WIDGET CO COM,Margin,20,40,"","","","-800.00",500.00,10/13/2026';
const SELL = '10/16/2026,YOU SOLD WIDGET CO COM (WDGT) (Margin),WDGT,WIDGET CO COM,Margin,22,"-40","",0.05,"",879.95,1379.95,10/19/2026';

describe('parseFidelityHistory', () => {
  it('reads a buy and a sell, with no time of day given, as filled at the New York open', () => {
    const { fills, skipped } = parseFidelityHistory(history([BUY, SELL]));

    expect(fills).toEqual([
      {
        ref: expect.any(String),
        executedAt: new Date('2026-10-09T13:30:00Z'),
        side: 'buy',
        quantity: 40,
        symbol: 'WDGT',
        assetClass: 'stock',
        optionType: null,
        strike: null,
        expiration: null,
        multiplier: 1,
        price: 20,
        fees: 0,
      },
      {
        ref: expect.any(String),
        executedAt: new Date('2026-10-16T13:30:00Z'),
        side: 'sell',
        quantity: 40,
        symbol: 'WDGT',
        assetClass: 'stock',
        optionType: null,
        strike: null,
        expiration: null,
        multiplier: 1,
        price: 22,
        fees: 0.05,
      },
    ]);
    expect(skipped).toEqual([]);
  });

  it('sums commission and fees, both already positive', () => {
    const row =
      '10/27/2026,YOU SOLD WIDGET CO COM (WDGT) (Margin),WDGT,WIDGET CO COM,Margin,30,"-15",0.5,0.05,"",450.00,2000,10/28/2026';

    const { fills } = parseFidelityHistory(history([row]));

    expect(fills[0]).toMatchObject({ fees: 0.55 });
  });

  it('converts a winter date across standard time too', () => {
    const row = BUY.replace('10/09/2026', '01/15/2027');

    const { fills } = parseFidelityHistory(history([row]));

    // 9:30 AM Eastern standard time.
    expect(fills[0].executedAt).toEqual(new Date('2027-01-15T14:30:00Z'));
  });

  it('lists rows it does not understand instead of guessing', () => {
    const dividend =
      '10/15/2026,DIVIDEND RECEIVED WIDGET CO COM (WDGT),WDGT,WIDGET CO COM,Cash,,,,,"",6.00,2000,10/15/2026';

    const { fills, skipped } = parseFidelityHistory(history([dividend]));

    expect(fills).toEqual([]);
    expect(skipped).toEqual([{ description: 'DIVIDEND RECEIVED WIDGET CO COM (WDGT)' }]);
  });

  it('says so when the file is not a Fidelity account history', () => {
    expect(parseFidelityHistory('Symbol,Qty\nWDGT,1')).toEqual({
      error: 'This is not a Fidelity account history: it has no Run Date column.',
    });
  });
});
