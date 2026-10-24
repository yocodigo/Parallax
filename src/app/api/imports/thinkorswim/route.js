import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { saveTradeContext } from '@/db/contexts';
import { applyImport, listImportCandidates } from '@/db/imports';
import { matchImport } from '@/lib/import/matchImport';
import { pairFills } from '@/lib/import/pairFills';
import { parseThinkorswimStatement } from '@/lib/import/thinkorswim';
import { logError, requestId, withErrorLogging } from '@/lib/log';
import { profitLoss } from '@/lib/tradeMetrics';
import { captureContext } from '@/server/marketContext';

const ROUTE = '/api/imports/thinkorswim';
// A year of statements is well under this.
const MAX_BYTES = 2 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

const isTimeZone = (name) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name });
    return true;
  } catch {
    return false;
  }
};

const formSchema = z.object({
  file: z
    .instanceof(File, { error: 'Choose the exported CSV' })
    .refine((file) => file.size <= MAX_BYTES, 'The file is too large for an account statement'),
  timeZone: z.string().refine(isTimeZone, 'Unknown time zone'),
  mode: z.enum(['live', 'paper', 'backtest']),
  confirm: z.boolean(),
});

const fieldError = (error, fieldErrors) => NextResponse.json({ error, fieldErrors }, { status: 400 });

// What the preview shows of each imported trade.
const previewOf = ({ action, tradeId, imported }) => ({ action, tradeId, ...imported, profitLoss: profitLoss(imported) });

// Body: multipart form with `file` (the account statement CSV), `timeZone`
// (the one thinkorswim is set to), `mode`, and `confirm` ("true" to save).
// Returns { trades, unpaired, unreadRows, applied } and, once applied, how
// many trades were `created` and `filled`. Each trade has its `action`:
// create, fill (with the `tradeId` filled in), or skip (imported before).
export const POST = withErrorLogging(ROUTE, async (request) => {
  const formData = await request.formData().catch(() => null);
  if (!formData) return fieldError('Expected a form with the statement', {});

  const parsed = formSchema.safeParse({
    file: formData.get('file') ?? undefined,
    timeZone: formData.get('timeZone') ?? '',
    mode: formData.get('mode') ?? undefined,
    confirm: formData.get('confirm') === 'true',
  });
  if (!parsed.success) return fieldError('Invalid import', z.flattenError(parsed.error).fieldErrors);
  const { file, timeZone, mode, confirm } = parsed.data;

  const statement = parseThinkorswimStatement(await file.text(), { timeZone });
  if (statement.error) return fieldError(statement.error, { file: [statement.error] });

  const { trades, unpaired } = pairFills(statement.fills);
  const db = getDb();
  const candidates = trades.length
    ? await listImportCandidates(db, {
        mode,
        symbols: [...new Set(trades.map((t) => t.symbol))],
        // A plan can be written the day before; matching narrows it down.
        since: new Date(trades[0].openedAt.getTime() - DAY_MS),
      })
    : [];
  const actions = matchImport(trades, candidates, { mode });

  const body = {
    trades: actions.map(previewOf),
    unpaired,
    unreadRows: statement.skipped,
    applied: false,
  };
  if (!confirm) return NextResponse.json(body);

  const { created, filled } = await applyImport(db, actions);

  // As when an entry is recorded by hand. By now the option's quote is too
  // old to keep, but the bars around the entry still tell its context.
  const reqId = requestId(request);
  after(async () => {
    for (const trade of [...created, ...filled]) {
      try {
        await saveTradeContext(db, trade.id, await captureContext(trade, { requestId: reqId }));
      } catch (error) {
        logError('Context capture failed', { route: ROUTE, requestId: reqId, tradeId: trade.id, error });
      }
    }
  });

  return NextResponse.json({ ...body, applied: true, created: created.length, filled: filled.length });
});
