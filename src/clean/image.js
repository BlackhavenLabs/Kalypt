import { stripJpegMetadata } from '../formats/jpeg.js';
import { stripPngMetadata } from '../formats/png.js';

export function cleanImage(buffer, kind) {
  if (kind === 'jpeg') return stripJpegMetadata(buffer);
  if (kind === 'png') return stripPngMetadata(buffer);
  throw new Error(`Unsupported image kind: ${kind}`);
}
