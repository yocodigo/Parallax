// Display formats shared by the journal UI and the weekly review.

const money = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  signDisplay: 'always',
});

// "+$998.00", "-$500.00".
export const formatProfitLoss = (amount) => money.format(amount);

// "+2.0R", "-1.0R".
export const formatR = (r) => `${r > 0 ? '+' : ''}${r.toFixed(1)}R`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// "500C exp Jan 16". The expiration is a 'YYYY-MM-DD' calendar date, read
// from its parts so no time zone can move it to the day before.
export function formatContract({ optionType, strike, expiration }) {
  if (!optionType || strike === null || strike === undefined || !expiration) return '';
  const [, month, day] = expiration.split('-').map(Number);
  return `${strike}${optionType === 'call' ? 'C' : 'P'} exp ${MONTHS[month - 1]} ${day}`;
}
