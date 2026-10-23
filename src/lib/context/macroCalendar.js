// Scheduled macro releases that move markets, copied from the official
// schedules on 2026-10-22:
//   FOMC: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
//         (the decision comes on a meeting's second day; 2027 is tentative)
//   CPI:  https://www.bls.gov/schedule/news_release/cpi.htm
//   Jobs: https://www.bls.gov/schedule/news_release/empsit.htm
// BLS blocks automated requests, so these are kept here. Extend them each
// year; outside COVERED_FROM..COVERED_THROUGH the answer is "unknown", not
// "nothing scheduled".

const COVERED_FROM = '2026-10-22';
const COVERED_THROUGH = '2027-12-31';

const EVENTS = {
  'FOMC decision': [
    '2026-10-28', '2026-12-09',
    '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09',
    '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08',
  ],
  CPI: [
    '2026-11-10', '2026-12-10',
    '2027-01-13', '2027-02-11', '2027-03-10', '2027-04-13', '2027-05-12', '2027-06-10',
    '2027-07-14', '2027-08-11', '2027-09-14', '2027-10-14', '2027-11-10', '2027-12-10',
  ],
  'Jobs report': [
    '2026-11-06', '2026-12-04',
    '2027-01-08', '2027-02-05', '2027-03-05', '2027-04-02', '2027-05-07', '2027-06-04',
    '2027-07-02', '2027-08-06', '2027-09-03', '2027-10-08', '2027-11-05', '2027-12-03',
  ],
};

const eventsOn = (date) => Object.keys(EVENTS).filter((name) => EVENTS[name].includes(date));

// The weekday after a 'YYYY-MM-DD' date, skipping Saturday and Sunday (market
// holidays aren't accounted for).
function nextWeekday(date) {
  const [year, month, day] = date.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day));
  do next.setUTCDate(next.getUTCDate() + 1);
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6);
  return next.toISOString().slice(0, 10);
}

// Scheduled releases on a New York date ('YYYY-MM-DD') and the next weekday:
// { today, nextWeekday }, each a list of names. Null when the date is outside
// what the schedules above cover.
export function macroEvents(date) {
  if (date < COVERED_FROM || date > COVERED_THROUGH) return null;
  return { today: eventsOn(date), nextWeekday: eventsOn(nextWeekday(date)) };
}
