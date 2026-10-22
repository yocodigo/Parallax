import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import Strategies from '../Strategies';

const existing = {
  id: '6f1c2a4e-0000-4000-8000-000000000001',
  name: '15m BB acceptance',
  description: 'Trend continuation after acceptance outside the 15m band.',
  rules: [
    { id: 'r1', text: 'Accepted above the 15m band', kind: 'edge' },
    { id: 'r2', text: 'Risk within my per-trade limit', kind: 'discipline' },
  ],
};

// A tiny in-memory store behind the strategies routes. Returns the requests.
function serveStrategies({ initial = [existing], respond } = {}) {
  const requests = [];
  let list = initial;
  server.use(
    http.get('*/api/strategies', () => HttpResponse.json({ strategies: list })),
    http.post('*/api/strategies', async ({ request }) => {
      const body = await request.json();
      requests.push({ method: 'POST', body });
      const custom = respond?.(body);
      if (custom) return custom;
      const strategy = { id: 'new', description: null, ...body, rules: body.rules.map((r, i) => ({ id: `n${i}`, ...r })) };
      list = [...list, strategy];
      return HttpResponse.json({ strategy }, { status: 201 });
    }),
    http.put('*/api/strategies/:id', async ({ request, params }) => {
      const body = await request.json();
      requests.push({ method: 'PUT', id: params.id, body });
      const strategy = { id: params.id, description: null, ...body };
      list = list.map((s) => (s.id === params.id ? strategy : s));
      return HttpResponse.json({ strategy });
    })
  );
  return requests;
}

function renderStrategies() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <Strategies />
    </SWRConfig>
  );
}

describe('Strategies', () => {
  it('lists each strategy with its edge and discipline rules', async () => {
    serveStrategies();
    renderStrategies();

    const card = await screen.findByRole('article', { name: '15m BB acceptance' });
    expect(within(card).getByText('Accepted above the 15m band')).toBeInTheDocument();
    expect(within(card).getByRole('list', { name: 'Edge rules' })).toHaveTextContent('Accepted above the 15m band');
    expect(within(card).getByRole('list', { name: 'Discipline rules' })).toHaveTextContent(
      'Risk within my per-trade limit'
    );
  });

  it('creates a strategy', async () => {
    const requests = serveStrategies({ initial: [] });
    renderStrategies();

    await userEvent.click(await screen.findByRole('button', { name: 'New strategy' }));
    await userEvent.type(screen.getByLabelText('Name'), 'Opening range breakout');
    await userEvent.type(screen.getByLabelText('Rule 1'), 'Break of the 5m opening range');
    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }));
    await userEvent.type(screen.getByLabelText('Rule 2'), 'Risk within my limit');
    await userEvent.selectOptions(screen.getByLabelText('Rule 2 kind'), 'discipline');
    await userEvent.click(screen.getByRole('button', { name: 'Save strategy' }));

    expect(await screen.findByRole('article', { name: 'Opening range breakout' })).toBeInTheDocument();
    expect(requests).toEqual([
      {
        method: 'POST',
        body: {
          name: 'Opening range breakout',
          description: '',
          rules: [
            { text: 'Break of the 5m opening range', kind: 'edge' },
            { text: 'Risk within my limit', kind: 'discipline' },
          ],
        },
      },
    ]);
  });

  it('edits a strategy, keeping the ids of its rules and their new order', async () => {
    const requests = serveStrategies();
    renderStrategies();

    const card = await screen.findByRole('article', { name: '15m BB acceptance' });
    await userEvent.click(within(card).getByRole('button', { name: 'Edit' }));
    await userEvent.clear(screen.getByLabelText('Rule 1'));
    await userEvent.type(screen.getByLabelText('Rule 1'), 'Accepted outside the 15m band');
    await userEvent.click(screen.getByRole('button', { name: 'Move rule 2 up' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save strategy' }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      method: 'PUT',
      id: existing.id,
      body: {
        rules: [
          { id: 'r2', text: 'Risk within my per-trade limit', kind: 'discipline' },
          { id: 'r1', text: 'Accepted outside the 15m band', kind: 'edge' },
        ],
      },
    });
  });

  it('removes a rule', async () => {
    const requests = serveStrategies();
    renderStrategies();

    await userEvent.click(within(await screen.findByRole('article')).getByRole('button', { name: 'Edit' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove rule 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save strategy' }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].body.rules.map((r) => r.id)).toEqual(['r2']);
  });

  it("shows the server's message", async () => {
    serveStrategies({
      initial: [],
      respond: () =>
        HttpResponse.json({ error: 'Invalid strategy', fieldErrors: { name: ['Name the strategy'] } }, { status: 400 }),
    });
    renderStrategies();

    await userEvent.click(await screen.findByRole('button', { name: 'New strategy' }));
    await userEvent.type(screen.getByLabelText('Rule 1'), 'Some rule');
    await userEvent.click(screen.getByRole('button', { name: 'Save strategy' }));

    expect(await screen.findByText('Name the strategy')).toBeInTheDocument();
  });
});
