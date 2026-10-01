import { parseExif } from './exif.js';

export function parseJpegMetadata(buffer) {
  const result = { exif: {}, segments: [] };
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return result;
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker >= 0xd0 && marker <= 0xd7) { offset += 2; continue; }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) break;
    const data = buffer.subarray(offset + 4, offset + 2 + length);
    result.segments.push({ marker, length, offset });
    if (marker === 0xe1 && data.subarray(0, 6).toString('binary') === 'Exif\0\0') {
      result.exif = parseExif(data.subarray(6));
    }
    if (marker === 0xed) result.hasIptc = true;
    if (marker === 0xfe) result.comment = data.toString('utf8').trim();
    offset += 2 + length;
  }
  return result;
}

export function stripJpegMetadata(buffer) {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) throw new Error('Not a JPEG');
  const parts = [buffer.subarray(0, 2)];
  let offset = 2;

  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff || offset + 1 >= buffer.length) {
      parts.push(buffer.subarray(offset));
      break;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xda) {
      parts.push(buffer.subarray(offset));
      break;
    }
    if (marker === 0xd9) {
      parts.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      parts.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > buffer.length) break;
    const length = buffer.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (end > buffer.length) break;
    const removable = marker === 0xe1 || marker === 0xed || marker === 0xfe;
    if (!removable) parts.push(buffer.subarray(offset, end));
    offset = end;
  }
  return Buffer.concat(parts);
}
