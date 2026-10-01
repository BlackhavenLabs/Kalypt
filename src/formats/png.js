import { inflateSync } from 'node:zlib';
import { crc32 } from '../util/crc32.js';
import { parseExif } from './exif.js';

export function parsePngMetadata(buffer) {
  const chunks = [];
  const metadata = {};
  for (const chunk of iterateChunks(buffer)) {
    chunks.push({ type: chunk.type, length: chunk.data.length });
    if (chunk.type === 'tEXt') {
      const zero = chunk.data.indexOf(0);
      if (zero !== -1) metadata[chunk.data.subarray(0, zero).toString()] = chunk.data.subarray(zero + 1).toString();
    } else if (chunk.type === 'zTXt') {
      const zero = chunk.data.indexOf(0);
      if (zero !== -1 && chunk.data[zero + 1] === 0) {
        try { metadata[chunk.data.subarray(0, zero).toString()] = inflateSync(chunk.data.subarray(zero + 2)).toString(); } catch { /* ignore */ }
      }
    } else if (chunk.type === 'iTXt') {
      metadata.iTXt = chunk.data.toString('utf8').replace(/\0/g, ' ').trim();
    } else if (chunk.type === 'eXIf') {
      metadata.exif = parseExif(chunk.data);
    }
  }
  return { chunks, metadata };
}

export function stripPngMetadata(buffer) {
  const keep = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'pHYs']);
  const signature = buffer.subarray(0, 8);
  const out = [signature];
  for (const chunk of iterateChunks(buffer)) {
    if (!keep.has(chunk.type)) continue;
    const type = Buffer.from(chunk.type);
    const length = Buffer.alloc(4); length.writeUInt32BE(chunk.data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([type, chunk.data])));
    out.push(length, type, chunk.data, crc);
  }
  return Buffer.concat(out);
}

function* iterateChunks(buffer) {
  if (buffer.subarray(1, 4).toString() !== 'PNG') throw new Error('Not a PNG');
  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString();
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    yield { type, data: buffer.subarray(dataStart, dataEnd) };
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }
}
