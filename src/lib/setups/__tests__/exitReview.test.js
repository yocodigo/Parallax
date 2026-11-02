import { describe, expect, it } from 'vitest';
import { reviewExit } from '../exitReview';

const MINUTE = 60_000;
const OPEN = Date.parse('2026-10-27T13:30:00Z');

const bar = (o, h, l, c) => ({ o, h, l, c });
// Twenty quiet bars below the 100 level (ranges of 1, so the ATR is about 1,
// and bodies of 0.2): 9:30 to 9:49. The fill is at 9:50, as the 21st bar opens.
const warmUp = Array.from({ length: 20 }, (_, k) => (k % 2 ? bar(98.2, 98.7, 97.7, 98) : bar(98, 98.5, 97.5, 98.2)));
const W = warmUp.length;
// The bar that reaches 100 from below, closing under it.
const touch = bar(98.1, 100, 98, 99.8);

const minutes = (bars) => bars.map((b, k) => ({ t: new Date(OPEN + k * MINUTE).toISOString(), v: 100, ...b }));
const at = (...bars) => minutes([...warmUp, ...bars]);
const mirror = (bars) => bars.map((b) => ({ ...b, o: 200 - b.o, h: 200 - b.l, l: 200 - b.h, c: 200 - b.c }));

// New York times on the fill day.
const time = (nyTime) => new Date(`2026-10-27T${nyTime}-04:00`);

const trade = (overrides = {}) => ({
  assetClass: 'stock',
  direction: 'long',
  symbol: 'SPY',
  openedAt: time('09:50:00'),
  closedAt: time('09:55:00'),
  exitReason: 'fib_rejection',
  ...overrides,
});

// The 50% is T1 at 100 and the 100% is T2 at 102.
const plan = { ltfDirection: 'bullish', ltfFib50: 100, ltfFib100: 102 };

const rejects = [touch, bar(99.8, 99.9, 99.2, 99.3)];
// A displacement close beyond 100 that holds for three bars, reaching 102.
const rips = [
  touch,
  bar(99.8, 101.6, 99.7, 101.5),
  bar(101.5, 101.9, 101.3, 101.8),
  bar(101.8, 102, 101.5, 101.7),
  bar(101.7, 102.1, 101.4, 102),
];

describe('reviewExit', () => {
  it('has no review for a trade that is still open', () => {
    expect(reviewExit(trade({ closedAt: null }), at(...rejects), plan)).toBeNull();
  });

  it('takes T1 and T2 from the day\'s working fib and classifies the reaction at T1', () => {
    const review = reviewExit(trade({ closedAt: time('09:52:00') }), at(...rejects), plan);
    expect(review).toMatchObject({
      bias: 'long',
      t1: 100,
      t2: 102,
      skipped: null,
      reaction: {
        kind: 'rejected',
        touchAt: '2026-10-27T13:50:00.000Z',
        decidedAt: '2026-10-27T13:51:00.000Z',
      },
    });
  });

  describe('a rejection at T1 says close', () => {
    it('matches an exit once the rejection is decided', () => {
      // The deciding bar (9:51) closes at 9:52:00.
      expect(reviewExit(trade({ closedAt: time('09:52:00') }), at(...rejects), plan).verdict).toBe('matched');
      expect(reviewExit(trade({ closedAt: time('10:30:00') }), at(...rejects), plan).verdict).toBe('matched');
    });

    it('calls an exit between the touch and the deciding bar early', () => {
      expect(reviewExit(trade({ closedAt: time('09:51:30') }), at(...rejects), plan).verdict).toBe('early');
    });
  });

  describe('a rip through T1 says hold toward T2', () => {
    it('matches an exit once T2 was reached', () => {
      // The 9:54 bar's high is 102.1; it closes at 9:55:00.
      expect(reviewExit(trade({ closedAt: time('09:55:00') }), at(...rips), plan).verdict).toBe('matched');
    });

    it('calls an exit before T2 was reached early', () => {
      expect(reviewExit(trade({ closedAt: time('09:53:30') }), at(...rips), plan).verdict).toBe('early');
    });
  });

  it('reports an oscillation without judging the exit, one exit per trade being all that is recorded', () => {
    const bars = at(touch, bar(99.8, 100.4, 99.7, 100.3), bar(100.3, 100.4, 99.6, 99.7));
    const review = reviewExit(trade({ closedAt: time('09:55:00') }), bars, plan);
    expect(review.reaction).toMatchObject({ kind: 'oscillating', drifting: false });
    expect(review.verdict).toBe('not_judged');
  });

  it('says step 5 gave no instruction when nothing was decided at T1', () => {
    // The touch, then nine more bars hovering just under the level.
    const hover = Array.from({ length: 9 }, () => bar(99.7, 100, 99.2, 99.7));
    const review = reviewExit(trade({ closedAt: time('10:10:00') }), at(touch, ...hover), plan);
    expect(review.reaction).toMatchObject({ kind: 'none' });
    expect(review.verdict).toBe('no_rule');
  });

  it('says it was not decided when the bars end first', () => {
    const review = reviewExit(trade({ closedAt: time('09:52:00') }), at(touch), plan);
    expect(review.reaction).toMatchObject({ kind: null });
    expect(review.verdict).toBe('not_decided');
  });

  it('still grades the reaction when the exit came before T1 was touched', () => {
    // Out at 9:50:30; the touch bar closes at 9:51.
    const review = reviewExit(trade({ closedAt: time('09:50:30') }), at(...rejects), plan);
    expect(review.reaction.kind).toBe('rejected');
    expect(review.verdict).toBe('before_t1');
  });

  it('says T1 was never reached when price stayed below it', () => {
    const review = reviewExit(trade(), at(bar(98, 98.5, 97.5, 98.2), bar(98.2, 98.7, 97.7, 98)), plan);
    expect(review.reaction).toBeNull();
    expect(review.verdict).toBe('not_reached');
  });

  it('mirrors for a short, with T1 below the fill', () => {
    const shortPlan = { ltfDirection: 'bearish', ltfFib50: 100, ltfFib100: 98 };
    const bars = minutes(mirror([...warmUp, ...rejects]));
    const review = reviewExit(trade({ direction: 'short', closedAt: time('09:52:00') }), bars, shortPlan);
    expect(review).toMatchObject({ bias: 'short', reaction: { kind: 'rejected' }, verdict: 'matched' });
  });

  it('reads the underlying for an option, so a bought put is a short', () => {
    const put = trade({ assetClass: 'option', direction: 'long', optionType: 'put' });
    const shortPlan = { ltfDirection: 'bearish', ltfFib50: 100, ltfFib100: 98 };
    const bars = minutes(mirror([...warmUp, ...rejects]));
    expect(reviewExit(put, bars, shortPlan)).toMatchObject({ bias: 'short', verdict: 'matched' });
  });

  describe('when there is no T1 to react at', () => {
    it('is skipped without a daily plan', () => {
      expect(reviewExit(trade(), at(...rejects), null)).toMatchObject({
        skipped: 'no_daily_plan',
        t1: null,
        reaction: null,
        verdict: null,
      });
    });

    it('is skipped when the fib is not on the trade\'s side of the fill', () => {
      // A long filled near 98 with its 50% at 95.
      const below = { ltfDirection: 'bearish', ltfFib50: 95, ltfFib100: 93 };
      expect(reviewExit(trade(), at(...rejects), below)).toMatchObject({
        skipped: 'fib_not_on_trade_side',
        t1: null,
        verdict: null,
      });
    });

    it('is skipped for a trade closed on a later day', () => {
      const swing = trade({ closedAt: new Date('2026-10-28T10:00:00-04:00') });
      expect(reviewExit(swing, at(...rejects), plan)).toMatchObject({ skipped: 'not_intraday', verdict: null });
    });
  });
});
