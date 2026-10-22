import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import WeeklyReview from '../WeeklyReview';

const REVIEW = 'You planned two trades this week.\n\nYou moved your stop on NVDA twice.';

// Count review requests and answer with `response`.
function serveReview(response) {
  const requests = [];
  server.use(
    http.post('*/api/weekly-review', ({ request }) => {
      requests.push(request);
      return response();
    })
  );
  return requests;
}

describe('WeeklyReview', () => {
  it('does not ask for a review until the button is pressed', () => {
    const requests = serveReview(() => HttpResponse.json({ review: REVIEW, entryCount: 3 }));

    render(<WeeklyReview />);

    expect(screen.getByRole('button', { name: /review my week/i })).toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });

  it('shows the review once it arrives', async () => {
    serveReview(() => HttpResponse.json({ review: REVIEW, entryCount: 3 }));
    const user = userEvent.setup();
    render(<WeeklyReview />);

    await user.click(screen.getByRole('button', { name: /review my week/i }));

    expect(await screen.findByText(/you moved your stop on nvda twice/i)).toBeInTheDocument();
    expect(screen.getByText(/based on 3 entries/i)).toBeInTheDocument();
  });

  it('says so when nothing was logged this week', async () => {
    serveReview(() => HttpResponse.json({ review: null, entryCount: 0 }));
    const user = userEvent.setup();
    render(<WeeklyReview />);

    await user.click(screen.getByRole('button', { name: /review my week/i }));

    expect(await screen.findByText(/nothing logged in the past 7 days/i)).toBeInTheDocument();
  });

  it("shows the server's error", async () => {
    serveReview(() =>
      HttpResponse.json(
        { error: "Couldn't write this week's review. Try again.", requestId: 'req-123' },
        { status: 502 }
      )
    );
    const user = userEvent.setup();
    render(<WeeklyReview />);

    await user.click(screen.getByRole('button', { name: /review my week/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't write this week's review. Try again. (Reference: req-123)"
    );
  });

  it('disables the button while the review is being written', async () => {
    let finish;
    serveReview(
      () => new Promise((resolve) => (finish = () => resolve(HttpResponse.json({ review: REVIEW, entryCount: 1 }))))
    );
    const user = userEvent.setup();
    render(<WeeklyReview />);

    await user.click(screen.getByRole('button', { name: /review my week/i }));

    expect(await screen.findByRole('button', { name: /writing/i })).toBeDisabled();
    finish();
    expect(await screen.findByRole('button', { name: /review my week/i })).toBeEnabled();
  });
});
