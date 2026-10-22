import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { SWRConfig } from 'swr';
import { server } from '@/mocks/server';
import VoiceNote from '../VoiceNote';

// jsdom has no microphone or MediaRecorder. This fake hands back one chunk
// of "audio" when stopped, the way a real recorder does.
class FakeMediaRecorder {
  constructor(stream) {
    this.stream = stream;
    this.mimeType = 'audio/webm';
    this.state = 'inactive';
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

const stopTrack = vi.fn();
const getUserMedia = vi.fn();

// jsdom swaps in its own Blob and FormData, but fetch is still Node's, and
// it can't read the bytes of a jsdom Blob, so an upload never finishes.
// Browsers have one of each; these tests use Node's to match its fetch.
// Node's FormData isn't exported anywhere jsdom leaves alone, so take it from
// a parsed Response.
let NodeFormData;
beforeAll(async () => {
  NodeFormData = (await new Response(new URLSearchParams('a=1')).formData()).constructor;
});

beforeEach(() => {
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal('FormData', NodeFormData);
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const reviewDraft = {
  draft: {
    kind: 'review',
    plan: null,
    entry: { notes: 'Moved my stop on NVDA.', symbol: 'NVDA', emotion: 'frustrated', mistakes: ['moved_stop'] },
  },
  fieldErrors: { plan: {}, entry: {} },
};

// Serves the journal, Scribe's transcript, and the draft, recording what the
// component sends to each.
function serveVoiceApis({
  entries = [],
  transcribe = () => HttpResponse.json({ text: 'Moved my stop on NVDA, frustrated.' }),
  draft = () => HttpResponse.json(reviewDraft),
} = {}) {
  const sent = { transcribe: [], draft: [], journal: [] };
  server.use(
    http.get('*/api/journal', () => HttpResponse.json({ entries })),
    // A drafted plan opens the plan form, which asks for history warnings.
    http.get('*/api/insights/warnings', () => HttpResponse.json({ warnings: [] })),
    http.post('*/api/voice/transcribe', async ({ request }) => {
      const form = await request.formData();
      sent.transcribe.push({ audio: form.get('audio'), keyterms: form.getAll('keyterms') });
      return transcribe();
    }),
    http.post('*/api/voice/draft', async ({ request }) => {
      sent.draft.push(await request.json());
      return draft();
    }),
    http.post('*/api/journal', async ({ request }) => {
      sent.journal.push(await request.json());
      return HttpResponse.json({ entry: { id: 'e1' } }, { status: 201 });
    })
  );
  return sent;
}

function renderVoiceNote() {
  return render(
    <SWRConfig value={{ dedupingInterval: 0, provider: () => new Map() }}>
      <VoiceNote />
    </SWRConfig>
  );
}

async function recordNote() {
  await userEvent.click(screen.getByRole('button', { name: 'Record voice note' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Stop recording' }));
}

describe('VoiceNote', () => {
  it('records, transcribes, drafts, and saves a review you confirm', async () => {
    const sent = serveVoiceApis();
    renderVoiceNote();

    await recordNote();

    // The transcript can be corrected before drafting.
    const transcript = await screen.findByLabelText('Transcript');
    expect(transcript).toHaveValue('Moved my stop on NVDA, frustrated.');
    expect(stopTrack).toHaveBeenCalled();
    await userEvent.clear(transcript);
    await userEvent.type(transcript, 'Moved my stop on NVDA. Frustrated.');
    await userEvent.click(screen.getByRole('button', { name: 'Draft entry' }));

    expect(await screen.findByLabelText('Notes')).toHaveValue('Moved my stop on NVDA.');
    expect(sent.draft).toEqual([{ transcript: 'Moved my stop on NVDA. Frustrated.' }]);
    expect(sent.transcribe[0].audio.size).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole('button', { name: 'Save review' }));

    expect(await screen.findByText('Saved to your journal.')).toBeInTheDocument();
    expect(sent.journal[0]).toMatchObject({ kind: 'review', symbol: 'NVDA', mistakes: ['moved_stop'] });
    expect(screen.queryByLabelText('Notes')).not.toBeInTheDocument();
  });

  it('listens for the tickers already in the journal', async () => {
    const sent = serveVoiceApis({
      entries: [
        { id: '1', kind: 'thesis', symbol: 'MSFT', mistakes: [], trade: null },
        { id: '2', kind: 'plan', symbol: null, mistakes: [], trade: { id: 't', symbol: 'AAPL' } },
        { id: '3', kind: 'review', symbol: 'AAPL', mistakes: [], trade: null },
      ],
    });
    renderVoiceNote();
    expect(await screen.findByText(/listening for 2 tickers/i)).toBeInTheDocument();

    await recordNote();

    await waitFor(() => expect(sent.transcribe).toHaveLength(1));
    expect(sent.transcribe[0].keyterms).toEqual(['MSFT', 'AAPL']);
  });

  it('opens a plan draft in the plan form with what it is missing', async () => {
    serveVoiceApis({
      draft: () =>
        HttpResponse.json({
          draft: {
            kind: 'plan',
            plan: { symbol: 'AAPL', direction: 'long', quantity: 100, plannedEntry: 210 },
            entry: { notes: 'Breakout over 210.', mistakes: [] },
          },
          fieldErrors: { plan: { initialStop: ['Say where your stop is'] }, entry: {} },
        }),
    });
    renderVoiceNote();

    await recordNote();
    await userEvent.click(await screen.findByRole('button', { name: 'Draft entry' }));

    expect(await screen.findByLabelText('Planned entry')).toHaveValue(210);
    expect(screen.getByText('Say where your stop is')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save plan' })).toBeInTheDocument();
  });

  it('can start over and discard the note', async () => {
    serveVoiceApis();
    renderVoiceNote();

    await recordNote();
    await screen.findByLabelText('Transcript');
    await userEvent.click(screen.getByRole('button', { name: 'Start over' }));

    expect(screen.queryByLabelText('Transcript')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record voice note' })).toBeInTheDocument();
  });

  it('explains when the microphone is blocked', async () => {
    serveVoiceApis();
    getUserMedia.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
    renderVoiceNote();

    await userEvent.click(screen.getByRole('button', { name: 'Record voice note' }));

    expect(await screen.findByText(/allow microphone access/i)).toBeInTheDocument();
  });

  it('shows the error when transcription fails', async () => {
    serveVoiceApis({
      transcribe: () =>
        HttpResponse.json(
          { error: 'Transcription failed. Try again.', requestId: 'req-123' },
          { status: 502 }
        ),
    });
    renderVoiceNote();

    await recordNote();

    expect(
      await screen.findByText('Transcription failed. Try again. (Reference: req-123)')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record voice note' })).toBeInTheDocument();
  });

  it('shows the error when drafting fails, keeping the transcript', async () => {
    serveVoiceApis({
      draft: () => HttpResponse.json({ error: "Couldn't turn that note into a draft." }, { status: 502 }),
    });
    renderVoiceNote();

    await recordNote();
    await userEvent.click(await screen.findByRole('button', { name: 'Draft entry' }));

    expect(await screen.findByText("Couldn't turn that note into a draft.")).toBeInTheDocument();
    expect(screen.getByLabelText('Transcript')).toHaveValue('Moved my stop on NVDA, frustrated.');
  });
});
