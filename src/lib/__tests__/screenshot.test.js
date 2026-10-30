// @vitest-environment node
// Node's own File and FormData, which route handlers receive, not jsdom's.
import { describe, expect, it } from 'vitest';
import { MAX_SCREENSHOT_BYTES, imageType, parseScreenshotForm } from '../screenshot';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff, 0xe0];
// "RIFF", a 4-byte size, then "WEBP".
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];

const bytes = (header, size = 1000) => {
  const data = new Uint8Array(Math.max(size, header.length));
  data.set(header);
  return data;
};

const image = (data = bytes(PNG), type = 'image/png') => new File([data], 'chart.png', { type });

function form({ file = image(), label } = {}) {
  const data = new FormData();
  if (file) data.append('image', file);
  if (label !== undefined) data.append('label', label);
  return data;
}

const errorPaths = (result) => result.error.issues.map((issue) => issue.path.join('.'));

describe('imageType', () => {
  it('names PNG, JPEG, and WebP images from their first bytes', () => {
    expect(imageType(bytes(PNG))).toBe('image/png');
    expect(imageType(bytes(JPEG))).toBe('image/jpeg');
    expect(imageType(bytes(WEBP))).toBe('image/webp');
  });

  it('is null for anything else', () => {
    expect(imageType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(imageType(new Uint8Array(0))).toBeNull();
  });
});

describe('MAX_SCREENSHOT_BYTES', () => {
  it('fits the Claude API image limit, 5 MB of base64', () => {
    expect(Math.ceil(MAX_SCREENSHOT_BYTES / 3) * 4).toBeLessThanOrEqual(5 * 1024 * 1024);
  });
});

describe('parseScreenshotForm', () => {
  it('reads the image bytes and takes the type from them, not from the browser', async () => {
    const result = await parseScreenshotForm(form({ file: image(bytes(JPEG), 'image/png'), label: 'entry' }));

    expect(result.success).toBe(true);
    expect(result.data.contentType).toBe('image/jpeg');
    expect(result.data.bytes).toEqual(bytes(JPEG));
    expect(result.data.label).toBe('entry');
  });

  it('leaves the label out when none is chosen', async () => {
    expect((await parseScreenshotForm(form())).data.label).toBeNull();
    expect((await parseScreenshotForm(form({ label: '' }))).data.label).toBeNull();
  });

  it('requires an image that is not empty', async () => {
    expect(errorPaths(await parseScreenshotForm(form({ file: null })))).toEqual(['image']);
    expect(errorPaths(await parseScreenshotForm(form({ file: image(new Uint8Array(0)) })))).toEqual(['image']);
  });

  it('rejects an image over the size limit', async () => {
    const result = await parseScreenshotForm(form({ file: image(bytes(PNG, MAX_SCREENSHOT_BYTES + 1)) }));

    expect(errorPaths(result)).toEqual(['image']);
  });

  it('rejects a file that is not a PNG, JPEG, or WebP image', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>');

    expect(errorPaths(await parseScreenshotForm(form({ file: image(svg, 'image/png') })))).toEqual(['image']);
  });

  it('rejects a label that is not setup, entry, or exit', async () => {
    expect(errorPaths(await parseScreenshotForm(form({ label: 'chart' })))).toEqual(['label']);
  });
});
