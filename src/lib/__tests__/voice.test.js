// @vitest-environment node
// Node's own File and FormData, which route handlers receive, not jsdom's.
import { describe, expect, it } from 'vitest';
import { MAX_AUDIO_BYTES, MAX_KEYTERMS, parseDraftRequest, parseTranscribeForm } from '../voice';

const audio = (bytes = 1000) => new File([new Uint8Array(bytes)], 'note.webm', { type: 'audio/webm' });

function form({ file = audio(), keyterms = [] } = {}) {
  const data = new FormData();
  if (file) data.append('audio', file);
  for (const term of keyterms) data.append('keyterms', term);
  return data;
}

const errorPaths = (result) => result.error.issues.map((issue) => issue.path.join('.'));

describe('parseTranscribeForm', () => {
  it('accepts a recording with ticker keyterms, uppercased and without duplicates', () => {
    const result = parseTranscribeForm(form({ keyterms: ['aapl', 'AAPL', 'BRK.B'] }));

    expect(result.success).toBe(true);
    expect(result.data.audio.name).toBe('note.webm');
    expect(result.data.keyterms).toEqual(['AAPL', 'BRK.B']);
  });

  it('requires a recording that is not empty', () => {
    expect(errorPaths(parseTranscribeForm(form({ file: null })))).toContain('audio');
    expect(errorPaths(parseTranscribeForm(form({ file: audio(0) })))).toContain('audio');
  });

  it('rejects a recording over the size limit', () => {
    expect(errorPaths(parseTranscribeForm(form({ file: audio(MAX_AUDIO_BYTES + 1) })))).toContain(
      'audio'
    );
  });

  it('rejects keyterms that are not tickers, or too many of them', () => {
    expect(errorPaths(parseTranscribeForm(form({ keyterms: ['{AAPL}'] })))).toContain('keyterms.0');

    const tooMany = Array.from({ length: MAX_KEYTERMS + 1 }, (_, i) => `T${i}`);
    expect(errorPaths(parseTranscribeForm(form({ keyterms: tooMany })))).toContain('keyterms');
  });
});

describe('parseDraftRequest', () => {
  it('accepts a transcript and trims it', () => {
    expect(parseDraftRequest({ transcript: '  Long AAPL.  ' }).data).toEqual({ transcript: 'Long AAPL.' });
  });

  it('rejects a missing or blank transcript', () => {
    expect(parseDraftRequest(null).success).toBe(false);
    expect(errorPaths(parseDraftRequest({ transcript: '  ' }))).toContain('transcript');
  });
});
