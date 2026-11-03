import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import EntryDelete from '../EntryDelete';

const URL = '*/api/journal/entry-1';

function serveDelete(response) {
  const requests = [];
  server.use(
    http.delete(URL, ({ request }) => {
      requests.push(request);
      return response();
    })
  );
  return requests;
}

const review = { id: 'entry-1', kind: 'review', trade: null };
const unfilledPlan = { id: 'entry-1', kind: 'plan', trade: { openedAt: null } };
const filledPlan = { id: 'entry-1', kind: 'plan', trade: { openedAt: '2026-10-29T14:30:00.000Z' } };

describe('EntryDelete', () => {
  it('asks for confirmation and sends nothing until it is given', async () => {
    const requests = serveDelete(() => HttpResponse.json({ deleted: true }));
    const user = userEvent.setup();
    render(<EntryDelete entry={review} />);

    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(screen.getByText(/delete this entry/i)).toBeInTheDocument();
    expect(requests).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('deletes once confirmed', async () => {
    const requests = serveDelete(() => HttpResponse.json({ deleted: true }));
    const user = userEvent.setup();
    render(<EntryDelete entry={review} />);

    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await user.click(screen.getByRole('button', { name: /yes, delete/i }));

    await screen.findByRole('button', { name: /^delete$/i });
    expect(requests).toHaveLength(1);
  });

  it('warns that an unfilled plan takes its trade and what hangs off it', async () => {
    const user = userEvent.setup();
    render(<EntryDelete entry={unfilledPlan} />);

    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(screen.getByText(/also deletes its trade/i)).toBeInTheDocument();
    expect(screen.getByText(/checklist answers, screenshots, and context/i)).toBeInTheDocument();
  });

  it('offers no delete on a plan whose trade has been filled', () => {
    render(<EntryDelete entry={filledPlan} />);

    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
  });

  it('shows the server error and keeps the entry', async () => {
    serveDelete(() => HttpResponse.json({ error: "This plan's trade has been filled." }, { status: 409 }));
    const user = userEvent.setup();
    render(<EntryDelete entry={unfilledPlan} />);

    await user.click(screen.getByRole('button', { name: /^delete$/i }));
    await user.click(screen.getByRole('button', { name: /yes, delete/i }));

    expect(await screen.findByText(/has been filled/i)).toBeInTheDocument();
  });
});
