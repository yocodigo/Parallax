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
