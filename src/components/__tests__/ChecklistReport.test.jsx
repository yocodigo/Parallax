import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import ChecklistReport from '../ChecklistReport';

const report = {
  followed: { trades: 6, totalR: 4.8, averageR: 0.8 },
  broken: { trades: 4, totalR: -3.2, averageR: -0.8 },
  rules: [
    { ruleId: 'r1', ruleText: 'Volume rising', checked: 10, skipped: 3, skippedAverageR: -1.1, metAverageR: 0.6 },
    { ruleId: 'r2', ruleText: 'Not the first impulse bar', checked: 10, skipped: 0, skippedAverageR: null, metAverageR: 0.16 },
  ],
  trades: 10,
};

// Serve the report and record the mode each request asked for.
function serveReport(body = report) {
  const modes = [];
  server.use(
    http.get('*/api/insights/checklist', ({ request }) => {
      modes.push(new URL(request.url).searchParams.get('mode'));
      return HttpResponse.json(body);
    })
  );
  return modes;
}

function renderReport() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <ChecklistReport />
    </SWRConfig>
  );
}

const cells = (row) => within(row).getAllByRole('cell').map((cell) => cell.textContent);

describe('ChecklistReport', () => {
  it('compares trades that met every rule against trades entered anyway', async () => {
    serveReport();
    renderReport();

    const summary = await screen.findByRole('table', { name: 'Checklist followed or not' });
    const rows = within(summary).getAllByRole('row');
    expect(cells(rows[1])).toEqual(['Every rule met', '6', '+4.8R', '+0.8R']);
    expect(cells(rows[2])).toEqual(['Entered anyway', '4', '-3.2R', '-0.8R']);
  });

  it('lists each rule with how often it was skipped and its R when skipped and met', async () => {
    serveReport();
    renderReport();

    const rules = await screen.findByRole('table', { name: 'Rules' });
    const rows = within(rules).getAllByRole('row');
    expect(cells(rows[1])).toEqual(['Volume rising', '3 of 10', '-1.1R', '+0.6R']);
    // Never skipped: nothing to average.
    expect(cells(rows[2])).toEqual(['Not the first impulse bar', '0 of 10', '—', '+0.2R']);
    expect(screen.getByText(/from 10 closed trades/i)).toBeInTheDocument();
  });

  it('asks for one mode when chosen', async () => {
    const modes = serveReport();
    renderReport();
    await screen.findAllByRole('table');

    await userEvent.selectOptions(screen.getByLabelText('Mode'), 'live');

    await screen.findAllByRole('table');
    expect(modes).toEqual([null, 'live']);
  });

  it('explains how to get a report when no checklist trades are closed yet', async () => {
    serveReport({
      followed: { trades: 0, totalR: 0, averageR: null },
      broken: { trades: 0, totalR: 0, averageR: null },
      rules: [],
      trades: 0,
    });
    renderReport();

    expect(await screen.findByText(/no closed trades with a checklist yet/i)).toBeInTheDocument();
  });

  it("shows the server's error", async () => {
    server.use(
      http.get('*/api/insights/checklist', () =>
        HttpResponse.json({ error: 'Something went wrong. Try again.', requestId: 'req-1' }, { status: 500 })
      )
    );
    renderReport();

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again. (Reference: req-1)');
  });
});
