import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import { DEFAULT_RULE_SETTINGS } from '@/lib/ruleSettings';
import RuleSettings from '../RuleSettings';

const settings = { ...DEFAULT_RULE_SETTINGS, premiumMax: 5, riskPerTrade: 20 };

// Serve the rules; a PUT saves the body and answers like the real route.
// Returns the bodies saved.
function serveRules({ initial = settings, respond } = {}) {
  const saved = [];
  let current = initial;
  server.use(
    http.get('*/api/rule-settings', () => HttpResponse.json({ settings: current })),
    http.put('*/api/rule-settings', async ({ request }) => {
      const body = await request.json();
      saved.push(body);
      const custom = respond?.(body);
      if (custom) return custom;
      current = body;
      return HttpResponse.json({ settings: current });
    })
  );
  return saved;
}

function renderRules() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <RuleSettings />
    </SWRConfig>
  );
}

describe('RuleSettings', () => {
  it('shows each rule with its on flag and values, a blank for what is not set', async () => {
    serveRules({ initial: { ...settings, premiumMax: null, riskPerTrade: null } });
    renderRules();

    expect(await screen.findByRole('checkbox', { name: 'Entry windows' })).toBeChecked();
    expect(screen.getByLabelText('Window 1 starts')).toHaveValue('09:30');
    expect(screen.getByLabelText('Window 3 ends')).toHaveValue('15:00');
    expect(screen.getByLabelText('Fewest contracts')).toHaveValue(1);
    expect(screen.getByLabelText('Most contracts')).toHaveValue(2);
    expect(screen.getByLabelText('Lowest premium ($)')).toHaveValue(0.5);
    expect(screen.getByLabelText('Highest premium ($)')).toHaveValue(null);
    expect(screen.getByLabelText('Risk per trade ($)')).toHaveValue(null);
    expect(screen.getByLabelText('Backstop (% below the entry premium)')).toHaveValue(25);
    expect(screen.getByLabelText('Time stop (minutes)')).toHaveValue(15);
  });

  it('saves a rule turned off with its values kept, and a blank as not set', async () => {
    const saved = serveRules();
    const user = userEvent.setup();
    renderRules();

    await user.click(await screen.findByRole('checkbox', { name: 'Backstop' }));
    await user.clear(screen.getByLabelText('Highest premium ($)'));
    await user.clear(screen.getByLabelText('Risk per trade ($)'));
    await user.click(screen.getByRole('button', { name: 'Save rules' }));

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(saved).toEqual([{ ...settings, backstopOn: false, premiumMax: null, riskPerTrade: null }]);
  });

  it('has no on flag for risk per trade: blank is not set, and a number is saved as typed', async () => {
    const saved = serveRules({ initial: { ...settings, riskPerTrade: null } });
    const user = userEvent.setup();
    renderRules();

    const risk = await screen.findByLabelText('Risk per trade ($)');
    expect(screen.queryByRole('checkbox', { name: 'Risk per trade' })).not.toBeInTheDocument();
    await user.type(risk, '25');
    await user.click(screen.getByRole('button', { name: 'Save rules' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].riskPerTrade).toBe(25);
  });

  it('saves the backstop as a share of the premium', async () => {
    const saved = serveRules();
    const user = userEvent.setup();
    renderRules();

    const backstop = await screen.findByLabelText('Backstop (% below the entry premium)');
    await user.clear(backstop);
    await user.type(backstop, '30');
    await user.click(screen.getByRole('button', { name: 'Save rules' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].backstopPct).toBe(0.3);
  });

  it('edits, adds, and removes windows', async () => {
    const saved = serveRules();
    const user = userEvent.setup();
    renderRules();

    await user.click(await screen.findByRole('button', { name: 'Remove window 2' }));
    await user.click(screen.getByRole('button', { name: 'Add window' }));
    // The window that was third is second now; the new one is third.
    await user.type(screen.getByLabelText('Window 3 starts'), '10:00');
    await user.type(screen.getByLabelText('Window 3 ends'), '10:30');
    await user.click(screen.getByRole('button', { name: 'Save rules' }));

    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0].windows).toEqual([
      ['09:30', '09:45'],
      ['14:45', '15:00'],
      ['10:00', '10:30'],
    ]);
  });

  it('shows the server’s field errors under the inputs', async () => {
    serveRules({
      respond: () =>
        HttpResponse.json(
          { error: 'Invalid rules', fieldErrors: { sizeMax: ['The most contracts can’t be below the fewest'] } },
          { status: 400 }
        ),
    });
    const user = userEvent.setup();
    renderRules();

    await user.click(await screen.findByRole('button', { name: 'Save rules' }));

    expect(await screen.findByText('The most contracts can’t be below the fewest')).toBeInTheDocument();
    expect(screen.getByLabelText('Most contracts')).toHaveAttribute('aria-invalid', 'true');
  });
});
