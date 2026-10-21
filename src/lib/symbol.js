import { z } from 'zod';

// Tickers (SPY, BRK.B), crypto pairs (BTC/USD), and option contract symbols
// (SPY260116C00500000), normalized to uppercase.
export const symbolSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9./-]{1,21}$/, 'Invalid symbol');