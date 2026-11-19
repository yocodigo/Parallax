import { profitLoss, tradeStatus } from './tradeMetrics';

// The Today page's daily loop (plan, import, review, coach) for one New York
// day and mode, from what is stored: the day's plans, the trades opened that
// day in the order opened, and the review entries linked to them.

// A step with something to count: done once every item is, waiting while
// there is nothing to do yet.
const countStep = (done, of) => ({ status: of === 0 ? 'waiting' : done === of ? 'done' : 'todo', done, of });

// Money is summed in whole cents, as on the performance page.
const toCents = (dollars) => Math.round(dollars * 100);

export function todaySummary({ plans, trades, reviews }) {
  // Reviews of trades not given (unlinked, or another day's) are ignored.
  const reviewsOf = new Map(trades.map((trade) => [trade.id, []]));
  for (const review of reviews) reviewsOf.get(review.tradeId)?.push(review);

  const rows = trades.map((trade) => ({ trade, pnl: profitLoss(trade), reviews: reviewsOf.get(trade.id) }));
  const closed = rows.filter((row) => tradeStatus(row.trade) === 'closed');
  const reviewed = closed.filter((row) => row.reviews.length > 0).length;
  const dayReviews = rows.flatMap((row) => row.reviews);
  const coached = dayReviews.filter((review) => review.coaching).length;

  // A plan with no working fib counts as no plan elsewhere (Target OK, the
  // exit review, the coach), so overnight levels alone only start the step.
  let plan = 'todo';
  if (plans.some((p) => p.ltfFib50 != null)) plan = 'done';
  else if (plans.length > 0) plan = 'started';

  // Imports aren't recorded, so the step reads the trades: done once the day
  // has trades and every one has its exit.
  let importStep = 'todo';
  if (trades.length > 0) importStep = closed.length === trades.length ? 'done' : 'open';

  return {
    tradeCount: trades.length,
    closedCount: closed.length,
    netPnl: closed.reduce((cents, row) => cents + toCents(row.pnl ?? 0), 0) / 100,
    reviewed,
    steps: {
      plan,
      import: importStep,
      review: countStep(reviewed, closed.length),
      coach: countStep(coached, dayReviews.length),
    },
    rows,
  };
}
