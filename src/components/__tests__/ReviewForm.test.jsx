import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import JournalEntries from '../JournalEntries';
import ReviewForm from '../ReviewForm';

const aapl = {
  id: '6f1c2a4e-0000-4000-8000-000000000001',
  mode: 'paper',
  symbol: 'AAPL',
  direction: 'long',
  quantity: 100,
};

const tsla = {
  id: '6f1c2a4e-0000-4000-8000-000000000002',
  mode: 'live',
  symbol: 'TSLA',
  direction: 'short',
  quantity: 5,
};

function entry(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    tradeId: null,
    kind: 'plan',
    symbol: null,
    notes: 'Some notes',
    emotion: null,
    mistakes: [],
    createdAt: '2026-10-20T14:30:00.000Z',
    trade: null,
    ...overrides,
  };
}

// The form finds trades to review in the journal, so every test serves one.
function serveJournal(entries) {
  server.use(http.get('*/api/journal', () => HttpResponse.json({ entries })));
}

const journalWithTrades = () => [
  entry({ tradeId: aapl.id, trade: aapl }),
  entry({ kind: 'thesis', symbol: 'MSFT' }),
  entry({ tradeId: tsla.id, trade: tsla }),
  entry({ kind: 'review', tradeId: aapl.id, trade: aapl }),
];

// Record the body of each review posted and answer with `response`.
function captureReviews(response = () => HttpResponse.json({}, { status: 201 })) {
  const bodies = [];
  server.use(
    http.post('*/api/journal', async ({ request }) => {
      const body = await request.json();
      bodies.push(body);
      return response(body);
    })
  );
  return bodies;
}

function renderForm(children = <ReviewForm />) {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>{children}</SWRConfig>
  );
}

const save = () => userEvent.click(screen.getByRole('button', { name: 'Save review' }));

describe('ReviewForm', () => {
  it('offers each trade in the journal once', async () => {
    serveJournal(journalWithTrades());
    renderForm();

    await screen.findByRole('option', { name: 'Long 100 AAPL · Paper' });
    const options = within(screen.getByLabelText('Trade')).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'Not linked to a trade',
      'Long 100 AAPL · Paper',
      'Short 5 TSLA · Live',
    ]);
  });

  it('sends the review with its trade, emotion, and mistakes', async () => {
    serveJournal(journalWithTrades());
    const bodies = captureReviews();
    renderForm();

    await screen.findByRole('option', { name: 'Short 5 TSLA · Live' });
    await userEvent.selectOptions(screen.getByLabelText('Trade'), tsla.id);
    await userEvent.type(screen.getByLabelText('Notes'), 'Covered too late.');
    await userEvent.selectOptions(screen.getByLabelText('Emotion'), 'frustrated');
    await userEvent.click(screen.getByLabelText('Held past target'));
    await userEvent.click(screen.getByLabelText('Moved stop'));
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      kind: 'review',
      tradeId: tsla.id,
      notes: 'Covered too late.',
      emotion: 'frustrated',
      mistakes: ['held_past_target', 'moved_stop'],
    });
  });

  it('can save a review that is not about one trade', async () => {
    serveJournal([]);
    const bodies = captureReviews();
    renderForm();

    await userEvent.type(screen.getByLabelText('Notes'), 'Choppy week, sat on my hands.');
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      kind: 'review',
      notes: 'Choppy week, sat on my hands.',
      mistakes: [],
    });
  });

  it('shows the field errors the server sends back', async () => {
    serveJournal([]);
    captureReviews(() =>
      HttpResponse.json(
        { error: 'Invalid journal entry', fieldErrors: { notes: ['Notes cannot be empty'] } },
        { status: 400 }
      )
    );
    renderForm();

    await userEvent.type(screen.getByLabelText('Notes'), ' ');
    await save();

    expect(await screen.findByText('Notes cannot be empty')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows the error when the review cannot be saved', async () => {
    serveJournal([]);
    captureReviews(() =>
      HttpResponse.json({ error: 'Database unavailable', requestId: 'req-123' }, { status: 500 })
    );
    renderForm();

    await userEvent.type(screen.getByLabelText('Notes'), 'Good discipline today.');
    await save();

    expect(await screen.findByText('Database unavailable (Reference: req-123)')).toBeInTheDocument();
  });

  it('adds the saved review to the journal and clears the form', async () => {
    // A tiny in-memory journal: saving a review adds an entry the list can load.
    const entries = [];
    serveJournal(entries);
    captureReviews((review) => {
      entries.unshift(entry({ ...review, id: crypto.randomUUID() }));
      return HttpResponse.json({ entry: entries[0] }, { status: 201 });
    });
    renderForm(
      <>
        <ReviewForm />
        <JournalEntries />
      </>
    );
    expect(await screen.findByText('No journal entries yet.')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Notes'), 'Exited early again.');
    await userEvent.click(screen.getByLabelText('Exited early'));
    await save();

    expect(await screen.findByText('Exited early again.')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toHaveValue('');
    expect(screen.getByLabelText('Exited early')).not.toBeChecked();
  });

  it('sends the symbol when the review names one', async () => {
    serveJournal([]);
    const bodies = captureReviews();
    renderForm();

    await userEvent.type(screen.getByLabelText('Symbol'), 'NVDA');
    await userEvent.type(screen.getByLabelText('Notes'), 'Sold the rip.');
    await save();

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toMatchObject({ symbol: 'NVDA', notes: 'Sold the rip.' });
  });

  it('starts from a draft and shows the errors it came with', async () => {
    serveJournal([]);
    renderForm(
      <ReviewForm
        draft={{
          entry: {
            notes: 'Moved my stop.',
            symbol: 'NVDA',
            emotion: 'frustrated',
            mistakes: ['moved_stop', 'oversized'],
          },
        }}
        draftErrors={{ plan: {}, entry: { symbol: ['Invalid symbol'] } }}
      />
    );

    expect(screen.getByLabelText('Notes')).toHaveValue('Moved my stop.');
    expect(screen.getByLabelText('Symbol')).toHaveValue('NVDA');
    expect(screen.getByLabelText('Emotion')).toHaveValue('frustrated');
    expect(screen.getByLabelText('Moved stop')).toBeChecked();
    expect(screen.getByLabelText('Oversized')).toBeChecked();
    expect(screen.getByLabelText('Entered late')).not.toBeChecked();
    expect(screen.getByText('Invalid symbol')).toBeInTheDocument();
  });

  it('tells its parent once the review is saved', async () => {
    serveJournal([]);
    const saved = { entry: { id: 'e1' } };
    captureReviews(() => HttpResponse.json(saved, { status: 201 }));
    const onSaved = vi.fn();
    renderForm(<ReviewForm onSaved={onSaved} />);

    await userEvent.type(screen.getByLabelText('Notes'), 'Good day.');
    await save();

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  });
});
