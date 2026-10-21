import { z } from 'zod';
import { symbolSchema } from './symbol';

// Vercel caps a function's request body at 4.5 MB. A browser recording
// (Opus, ~32-64 kbps) fits about 8 minutes in 4 MB.
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;

// Scribe bills requests with more than 100 keyterms for at least 20 seconds,
// so a short voice note stays under that.
export const MAX_KEYTERMS = 100;

const transcribeSchema = z.object({
  audio: z
    .instanceof(Blob, { message: 'A recording is required' })
    .refine((file) => file.size > 0, 'The recording is empty')
    .refine((file) => file.size <= MAX_AUDIO_BYTES, 'The recording is too long'),
  keyterms: z
    .array(symbolSchema)
    .max(MAX_KEYTERMS)
    .transform((list) => [...new Set(list)]),
});

// Form fields: `audio` (the recording) and `keyterms` (one field per ticker
// the transcription should listen for).
export function parseTranscribeForm(formData) {
  return transcribeSchema.safeParse({
    audio: formData.get('audio') ?? undefined,
    keyterms: formData.getAll('keyterms'),
  });
}
