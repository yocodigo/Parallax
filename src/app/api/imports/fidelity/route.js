import { after, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db';
import { saveTradeContext } from '@/db/contexts';
import { applyImport, listImportCandidates } from '@/db/imports';
import { parseFidelityHistory } from '@/lib/import/fidelity';
import { matchImport } from '@/lib/import/matchImport';
import { pairFills } from '@/lib/import/pairFills';
import { logError, requestId, withErrorLogging } from '@/lib/log';
import { holdMinutes, profitLoss } from '@/lib/tradeMetrics';
import { captureContext } from '@/server/marketContext';

const ROUTE = '/api/imports/fidelity';
// A year of history is well under this.
const MAX_BYTES = 2 * 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

const formSchema = z.object({
  file: z
    .instanceof(File, { error: 'Choose the exported CSV' })
    .refine((file) => file.size <= MAX_BYTES, 'The file is too large for an account history'),
  mode: z.enum(['live', 'paper', 'backtest']),
  confirm: z.boolean(),
});

const fieldError = (error, fieldErrors) => NextResponse.json({ error, fieldErrors }, { status: 400 });

// What the preview shows of each imported trade.
const previewOf = ({ action, tradeId, imported }) => ({
  action,
  tradeId,
  ...imported,
  profitLoss: profitLoss(imported),
  holdMinutes: holdMinutes(imported),
});

// Body: multipart form with `file` (the account history CSV), `mode`, and
// `confirm` ("true" to save). Returns { trades, unpaired, unreadRows,
// applied } and, once applied, how many trades were `created` and `filled`.
// Each trade has its `action`: create, fill (with the `tradeId` filled in),
// or skip (imported before).
export const POST = withErrorLogging(ROUTE, async (request) => {
  const formData = await request.formData().catch(() => null);
  if (!formData) return fieldError('Expected a form with the history', {});

  const parsed = formSchema.safeParse({
    file: formData.get('file') ?? undefined,
    mode: formData.get('mode') ?? undefined,
    confirm: formData.get('confirm') === 'true',
  });
  if (!parsed.success) return fieldError('Invalid import', z.flattenError(parsed.error).fieldErrors);
  const { file, mode, confirm } = parsed.data;

  const history = parseFidelityHistory(await file.text());
  if (history.error) return fieldError(history.error, { file: [history.error] });

  const { trades, unpaired } = pairFills(history.fills);
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
    unreadRows: history.skipped,
    applied: false,
  };
  if (!confirm) return NextResponse.json(body);

  const { created, filled } = await applyImport(db, actions, { source: 'Fidelity' });

  // As when an entry is recorded by hand. The fill time is a placeholder
  // (the New York open), but the bars around it still tell the day's story.
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
