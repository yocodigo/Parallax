import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import Home from '../page';

describe('Home', () => {
  it('is the Today page', async () => {
    server.use(http.get('*/api/today', () => HttpResponse.json({ error: 'not served' }, { status: 500 })));
    render(<Home />);

    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Day and mode' })).toBeInTheDocument();
  });
});
