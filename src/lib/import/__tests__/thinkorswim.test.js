import { describe, expect, it } from 'vitest';
import { parseThinkorswimStatement } from '../thinkorswim';

const PACIFIC = 'America/Los_Angeles';

// A thinkorswim account statement export, trimmed to the parts the import
// reads, with made-up fills. thinkorswim writes times in the time zone the
// platform is set to, whatever the header says.
const statement = (cashRows) =>
  [
    '﻿Account Statement for 00000000SCHW (Cash) since 10/22/26 through 10/22/26',
    '',
    'Cash Balance',
    'DATE,TIME,TYPE,REF #,DESCRIPTION,Misc Fees,Commissions & Fees,AMOUNT,BALANCE',
    '10/22/26,22:00:00,BAL,,Cash balance at the start of business day 23.10 CST,,,,500.00',
    ...cashRows,
    ',,,,TOTAL,($0.02),($1.30),($20.00),$478.68',
    '',
    'Account Summary',
    'Net Liquidating Value,$478.68',
    'Total Commissions & Fees YTD,"$1,234.56"',
  ].join('\n');

const BUY = '10/23/26,09:31:05,TRD,="1000000000001",BOT +2 QQQ 100 (Weeklys) 23 OCT 26 600 CALL @2.10,-0.02,-1.30,-420.00,80.00';
const SELL = '10/23/26,09:40:12,TRD,="1000000000002",SOLD -2 QQQ 100 (Weeklys) 23 OCT 26 600 CALL @.95 CBOE,-0.02,-1.30,190.00,268.68';

describe('parseThinkorswimStatement', () => {
  it("reads each option fill from the cash balance, in the platform's time zone", () => {
    const { fills, skipped } = parseThinkorswimStatement(statement([BUY]), { timeZone: PACIFIC });

    expect(fills).toEqual([
      {
        ref: '1000000000001',
        // 9:31:05 AM Pacific daylight time.
        executedAt: new Date('2026-10-23T16:31:05Z'),
        side: 'buy',
        quantity: 2,
        symbol: 'QQQ',
        assetClass: 'option',
        optionType: 'call',
        strike: 600,
        expiration: '2026-10-23',
        multiplier: 100,
        price: 2.1,
        fees: 1.32,
      },
    ]);
    expect(skipped).toEqual([]);
  });

  it('reads a sale, a price without a leading zero, and the exchange after the price', () => {
    const { fills } = parseThinkorswimStatement(statement([BUY, SELL]), { timeZone: PACIFIC });

    expect(fills[1]).toMatchObject({ ref: '1000000000002', side: 'sell', quantity: 2, price: 0.95, fees: 1.32 });
  });

  it('reads a put, and a standard monthly contract with no label', () => {
    const row =
      '10/23/26,10:00:00,TRD,="1000000000003",BOT +1 SPY 100 20 NOV 26 740 PUT @3.25,-0.01,-0.65,-325.00,100.00';

    const { fills } = parseThinkorswimStatement(statement([row]), { timeZone: PACIFIC });

    expect(fills[0]).toMatchObject({ symbol: 'SPY', optionType: 'put', strike: 740, expiration: '2026-11-20', price: 3.25 });
  });

  it('converts times in another time zone, across daylight saving time', () => {
    const winter = BUY.replace('10/23/26,09:31:05', '01/15/27,10:00:00').replace('23 OCT 26', '15 JAN 27');

    const { fills } = parseThinkorswimStatement(statement([winter]), { timeZone: 'America/New_York' });

    // 10 AM Eastern standard time.
    expect(fills[0].executedAt).toEqual(new Date('2027-01-15T15:00:00Z'));
    expect(fills[0].expiration).toBe('2027-01-15');
  });

  it('lists trade rows it does not understand instead of guessing', () => {
    const stock = '10/23/26,10:05:00,TRD,="1000000000004",BOT +10 AAPL @250.00,,0.00,-2500.00,0.00';

    const { fills, skipped } = parseThinkorswimStatement(statement([stock]), { timeZone: PACIFIC });

    expect(fills).toEqual([]);
    expect(skipped).toEqual([{ ref: '1000000000004', description: 'BOT +10 AAPL @250.00' }]);
  });

  it('ignores balances, deposits, and the total line', () => {
    const deposit = '10/23/26,08:00:00,RAD,="1000000000005",CLIENT REQUESTED ELECTRONIC FUNDING RECEIPT,,,100.00,600.00';

    const { fills, skipped } = parseThinkorswimStatement(statement([deposit]), { timeZone: PACIFIC });

    expect(fills).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it('says so when the file is not a thinkorswim account statement', () => {
    expect(parseThinkorswimStatement('Symbol,Qty\nSPY,1', { timeZone: PACIFIC })).toEqual({
      error: 'This is not a thinkorswim account statement: it has no Cash Balance section.',
    });
  });
});
