// The five sections of a Performance Review, in the order the page shows them.
// Kept apart from reviewCoach.js (the prompt and its schema) so the page can
// import the titles without the prompt and the setup rules.
export const REVIEW_SECTIONS = [
  { key: 'strengths', title: 'Strengths' },
  { key: 'patternsToFix', title: 'Patterns to Fix' },
  { key: 'ruleAdherence', title: 'Rule Adherence' },
  { key: 'emotionalPatterns', title: 'Emotional Patterns' },
  { key: 'recommendations', title: 'Recommendations for This Week' },
];
