'use client';

import { useRef, useState } from 'react';
import useSWR from 'swr';
import { apiErrorMessage, fetchJson } from '@/lib/fetchJson';
import { MAX_KEYTERMS } from '@/lib/voice';
import { inputClass } from './Field';
import PlanForm from './PlanForm';
import ReviewForm from './ReviewForm';

// Tickers in the journal, each once, newest first. Scribe uses them as
// keyterms so "AAPL" isn't heard as "apple".
function tickersIn(entries = []) {
  const tickers = new Set();
  for (const entry of entries) {
    for (const symbol of [entry.symbol, entry.trade?.symbol]) {
      if (symbol) tickers.add(symbol);
    }
  }
  return [...tickers].slice(0, MAX_KEYTERMS);
}

// Scribe reads the format from the file, but a matching extension helps.
const fileName = (mimeType) => (mimeType.includes('mp4') ? 'voice-note.mp4' : 'voice-note.webm');

async function postJson(url, options) {
  const res = await fetch(url, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(apiErrorMessage(json, 'Request failed'));
  return json;
}

const buttonClass =
  'rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50';
const secondaryButtonClass =
  'rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50';

// Steps: idle -> recording -> transcribing -> transcript (editable)
// -> drafting -> draft (confirmed in the plan or review form) -> idle.
export default function VoiceNote() {
  const { data } = useSWR('/api/journal', fetchJson, { revalidateOnFocus: false });
  const [step, setStep] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const recorder = useRef(null);

  const tickers = tickersIn(data?.entries);

  const startOver = () => {
    setStep('idle');
    setTranscript('');
    setDraft(null);
    setError(null);
  };

  const transcribe = async (audio) => {
    setStep('transcribing');
    const form = new FormData();
    form.append('audio', audio, fileName(audio.type));
    for (const ticker of tickers) form.append('keyterms', ticker);

    try {
      const { text } = await postJson('/api/voice/transcribe', { method: 'POST', body: form });
      setTranscript(text);
      setStep('transcript');
    } catch (e) {
      setError(e.message);
      setStep('idle');
    }
  };

  const record = async () => {
    setError(null);
    setSaved(false);

    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't record audio.");
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Allow microphone access to record a voice note.');
      return;
    }

    const chunks = [];
    const mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
    mediaRecorder.onstop = () => {
      // Release the microphone so the browser's recording indicator goes away.
      stream.getTracks().forEach((track) => track.stop());
      transcribe(new Blob(chunks, { type: mediaRecorder.mimeType }));
    };
    mediaRecorder.start();
    recorder.current = mediaRecorder;
    setStep('recording');
  };

  const stop = () => recorder.current?.stop();

  const draftEntry = async () => {
    setError(null);
    setStep('drafting');
    try {
      const result = await postJson('/api/voice/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      setDraft(result);
      setStep('draft');
    } catch (e) {
      setError(e.message);
      setStep('transcript');
    }
  };

  const onSaved = () => {
    startOver();
    setSaved(true);
  };

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-700">Voice note</h2>
        {tickers.length > 0 && (
          <span className="text-xs text-gray-500">
            Listening for {tickers.length} tickers from your journal
          </span>
        )}
      </div>

      {(step === 'idle' || step === 'recording') && (
        <div className="flex items-center gap-3">
          {step === 'idle' ? (
            <button type="button" onClick={record} className={buttonClass}>
              Record voice note
            </button>
          ) : (
            <>
              <button type="button" onClick={stop} className={buttonClass}>
                Stop recording
              </button>
              <span className="text-sm text-red-600">Recording…</span>
            </>
          )}
          {saved && <span className="text-sm text-green-700">Saved to your journal.</span>}
        </div>
      )}

      {step === 'transcribing' && <p className="text-sm text-gray-500">Transcribing…</p>}

      {(step === 'transcript' || step === 'drafting') && (
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="voice-transcript" className="text-xs font-medium text-gray-500">
              Transcript
            </label>
            <textarea
              id="voice-transcript"
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={4}
              className={inputClass}
            />
            <p className="text-xs text-gray-500">Fix anything that was misheard, then draft the entry.</p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={draftEntry}
              disabled={step === 'drafting'}
              className={buttonClass}
            >
              Draft entry
            </button>
            <button type="button" onClick={startOver} className={secondaryButtonClass}>
              Start over
            </button>
            {step === 'drafting' && <span className="self-center text-sm text-gray-500">Drafting…</span>}
          </div>
        </div>
      )}

      {step === 'draft' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Check the draft, fill in anything missing, then save it.
          </p>
          {draft.draft.kind === 'plan' ? (
            <PlanForm draft={draft.draft} draftErrors={draft.fieldErrors} onSaved={onSaved} />
          ) : (
            <ReviewForm draft={draft.draft} draftErrors={draft.fieldErrors} onSaved={onSaved} />
          )}
          <button type="button" onClick={startOver} className={secondaryButtonClass}>
            Start over
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
    </section>
  );
}
