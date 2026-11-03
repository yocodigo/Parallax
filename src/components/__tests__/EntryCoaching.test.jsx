import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import EntryCoaching from '../EntryCoaching';

const COACHING = 'You exited SPY early.\n\nHold to the first target.';
const URL = '*/api/journal/entry-1/coaching';

function serveCoaching(response) {
  const requests = [];
  server.use(
    http.post(URL, ({ request }) => {
      requests.push(request);
      return response();
    })
  );
  return requests;
}

describe('EntryCoaching', () => {
  it('offers to coach the day, without asking until pressed', () => {
    const requests = serveCoaching(() => HttpResponse.json({ coaching: COACHING }));

    render(<EntryCoaching entry={{ id: 'entry-1', coaching: null, coachedAt: null }} />);

    expect(screen.getByRole('button', { name: /coach this day/i })).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('shows the stored coaching with a re-run button', () => {
    render(
      <EntryCoaching entry={{ id: 'entry-1', coaching: COACHING, coachedAt: '2026-10-29T23:00:00.000Z' }} />
    );

    expect(screen.getByText(/hold to the first target/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /coach again/i })).toBeInTheDocument();
  });

  it('shows the coaching once it arrives', async () => {
    serveCoaching(() => HttpResponse.json({ coaching: COACHING, coachedAt: '2026-10-29T23:00:00.000Z' }));
    const user = userEvent.setup();
    render(<EntryCoaching entry={{ id: 'entry-1', coaching: null, coachedAt: null }} />);

    await user.click(screen.getByRole('button', { name: /coach this day/i }));

    expect(await screen.findByText(/hold to the first target/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /coach again/i })).toBeInTheDocument();
  });

  it('says so when no trade was opened that day', async () => {
    serveCoaching(() => HttpResponse.json({ coaching: null, reason: 'No trade was opened that day' }));
    const user = userEvent.setup();
    render(<EntryCoaching entry={{ id: 'entry-1', coaching: null, coachedAt: null }} />);

    await user.click(screen.getByRole('button', { name: /coach this day/i }));

    expect(await screen.findByText(/no trade was opened that day/i)).toBeInTheDocument();
  });

  it("shows the server's error and keeps the earlier coaching", async () => {
    serveCoaching(() =>
      HttpResponse.json({ error: "Couldn't write the coaching. Try again.", requestId: 'req-9' }, { status: 502 })
    );
    const user = userEvent.setup();
    render(<EntryCoaching entry={{ id: 'entry-1', coaching: COACHING, coachedAt: '2026-10-29T23:00:00.000Z' }} />);

    await user.click(screen.getByRole('button', { name: /coach again/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't write the coaching.*req-9/i);
    expect(screen.getByText(/hold to the first target/i)).toBeInTheDocument();
  });
});
