import { stripId3, stripWavInfo } from '../formats/media.js';

export function cleanMedia(buffer, kind) {
  if (kind === 'mp3') return stripId3(buffer);
  if (kind === 'wav') return stripWavInfo(buffer);
  throw new Error(`No built-in safe media cleaner for ${kind}`);
}
