import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clientKey, rateLimit } from '@/lib/rateLimit';
import { parseTranscribeForm } from '@/lib/voice';

const SCRIBE_URL = 'https://api.elevenlabs.io/v1/speech-to-text';

// Body: multipart form with `audio` and one `keyterms` field per ticker.
// Returns { text }, the raw transcript.
export async function POST(request) {
  // Each transcription costs money, so voice routes get their own budget.
  const limit = rateLimit(`voice:${clientKey(request)}`);
  if (!limit.ok) {
    return NextResponse.json({ error: 'Too many requests. Please slow down.' }, { status: 429 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing ELEVENLABS_API_KEY in environment.' }, { status: 500 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'Expected a form with a recording' }, { status: 400 });
  }

  const parsed = parseTranscribeForm(formData);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid recording', fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 }
    );
  }

  const { audio, keyterms } = parsed.data;
  const scribeForm = new FormData();
  scribeForm.append('model_id', 'scribe_v2');
  scribeForm.append('file', audio);
  // Tickers bias recognition toward "AAPL" over "apple".
  for (const term of keyterms) scribeForm.append('keyterms', term);

  const failed = (...details) => {
    // Scribe's error details stay in the server log, not the response.
    console.error('Scribe transcription failed', ...details);
    return NextResponse.json({ error: 'Transcription failed. Try again.' }, { status: 502 });
  };

  let res;
  try {
    res = await fetch(SCRIBE_URL, {
      method: 'POST',
      headers: { 'xi-api-key': apiKey },
      body: scribeForm,
    });
  } catch (error) {
    return failed(error);
  }

  if (!res.ok) return failed(res.status, await res.text());

  const { text } = await res.json();
  return NextResponse.json({ text });
}
