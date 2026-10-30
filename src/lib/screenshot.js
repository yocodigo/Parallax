import { z } from 'zod';

// Chart screenshots attached to a trade during the review (setups.md 9.5).
// The Claude API takes 5 MB per image as base64, which is a third larger than
// the file: 3.75 MiB encodes to exactly 5 MiB, so whatever is stored can be sent
// as is. It's also under Vercel's 4.5 MB request body cap.
export const MAX_SCREENSHOT_BYTES = 3.75 * 1024 * 1024;
export const MAX_SCREENSHOTS_PER_TRADE = 3;
export const SCREENSHOT_LABELS = ['setup', 'entry', 'exit'];

const startsWith = (bytes, header, offset = 0) =>
  bytes.length >= offset + header.length && header.every((byte, i) => bytes[offset + i] === byte);

// The type from the file's first bytes. The browser's type is only a guess
// from the file name, and the stored type is what the image is served as.
export function imageType(bytes) {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  // "RIFF", then the file size, then "WEBP".
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp';
  }
  return null;
}

const screenshotSchema = z
  .object({
    // `abort` stops at a failed check, so an empty or oversized file gets one
    // error rather than also "not an image", and is never read.
    image: z
      .instanceof(Blob, { message: 'An image is required' })
      .refine((file) => file.size > 0, { message: 'The image is empty', abort: true })
      .refine((file) => file.size <= MAX_SCREENSHOT_BYTES, {
        message: 'The image is over 3.75 MB',
        abort: true,
      })
      .transform(async (file) => new Uint8Array(await file.arrayBuffer()))
      .refine((bytes) => imageType(bytes) !== null, 'Only PNG, JPEG, or WebP images'),
    label: z.enum(SCREENSHOT_LABELS).nullable(),
  })
  .transform(({ image, label }) => ({ bytes: image, contentType: imageType(image), label }));

// Form fields: `image` (the file) and an optional `label`. Resolves to a
// safeParse result with { bytes, contentType, label }.
export async function parseScreenshotForm(formData) {
  return screenshotSchema.safeParseAsync({
    image: formData.get('image') ?? undefined,
    label: formData.get('label') || null,
  });
}
