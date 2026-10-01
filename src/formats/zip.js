import { inflateRawSync, deflateRawSync } from 'node:zlib';
import { crc32 } from '../util/crc32.js';
import { readUInt16LE, readUInt32LE, writeUInt16LE, writeUInt32LE } from '../util/bytes.js';

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

export function readZip(buffer, { maxEntries = 10000, maxInflatedBytes = 512 * 1024 * 1024 } = {}) {
  const eocd = findEocd(buffer);
  if (!eocd) throw new Error('Invalid ZIP: end-of-central-directory not found');

  const entryCount = readUInt16LE(buffer, eocd + 10);
  const centralOffset = readUInt32LE(buffer, eocd + 16);
  if (entryCount > maxEntries) throw new Error(`ZIP contains too many entries (${entryCount})`);

  const entries = [];
  let offset = centralOffset;
  let totalInflated = 0;

  for (let i = 0; i < entryCount; i += 1) {
    if (readUInt32LE(buffer, offset) !== SIG_CENTRAL) throw new Error('Invalid ZIP central directory');
    const flags = readUInt16LE(buffer, offset + 8);
    const method = readUInt16LE(buffer, offset + 10);
    const modTime = readUInt16LE(buffer, offset + 12);
    const modDate = readUInt16LE(buffer, offset + 14);
    const crc = readUInt32LE(buffer, offset + 16);
    const compressedSize = readUInt32LE(buffer, offset + 20);
    const uncompressedSize = readUInt32LE(buffer, offset + 24);
    const nameLength = readUInt16LE(buffer, offset + 28);
    const extraLength = readUInt16LE(buffer, offset + 30);
    const commentLength = readUInt16LE(buffer, offset + 32);
    const externalAttrs = readUInt32LE(buffer, offset + 38);
    const localOffset = readUInt32LE(buffer, offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString(flags & 0x800 ? 'utf8' : 'utf8');

    totalInflated += uncompressedSize;
    if (totalInflated > maxInflatedBytes) throw new Error('ZIP expanded size exceeds safety limit');

    const data = readLocalData(buffer, localOffset, compressedSize, method);
    entries.push({ name, data, method, flags, crc, compressedSize, uncompressedSize, modTime, modDate, externalAttrs });
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function readLocalData(buffer, localOffset, compressedSize, method) {
  if (readUInt32LE(buffer, localOffset) !== SIG_LOCAL) throw new Error('Invalid ZIP local header');
  const nameLength = readUInt16LE(buffer, localOffset + 26);
  const extraLength = readUInt16LE(buffer, localOffset + 28);
  const start = localOffset + 30 + nameLength + extraLength;
  const compressed = buffer.subarray(start, start + compressedSize);
  if (method === 0) return Buffer.from(compressed);
  if (method === 8) return inflateRawSync(compressed);
  throw new Error(`Unsupported ZIP compression method ${method}`);
}

export function writeZip(entries) {
  const locals = [];
  const centrals = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const raw = Buffer.from(entry.data);
    const deflated = deflateRawSync(raw, { level: 6 });
    const useDeflate = deflated.length < raw.length;
    const data = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const modTime = entry.modTime ?? 0;
    const modDate = entry.modDate ?? 0x21;
    const flags = 0x800;

    const local = Buffer.concat([
      writeUInt32LE(SIG_LOCAL),
      writeUInt16LE(20),
      writeUInt16LE(flags),
      writeUInt16LE(method),
      writeUInt16LE(modTime),
      writeUInt16LE(modDate),
      writeUInt32LE(crc),
      writeUInt32LE(data.length),
      writeUInt32LE(raw.length),
      writeUInt16LE(name.length),
      writeUInt16LE(0),
      name,
      data
    ]);

    const central = Buffer.concat([
      writeUInt32LE(SIG_CENTRAL),
      writeUInt16LE(20),
      writeUInt16LE(20),
      writeUInt16LE(flags),
      writeUInt16LE(method),
      writeUInt16LE(modTime),
      writeUInt16LE(modDate),
      writeUInt32LE(crc),
      writeUInt32LE(data.length),
      writeUInt32LE(raw.length),
      writeUInt16LE(name.length),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt16LE(0),
      writeUInt32LE(entry.externalAttrs ?? 0),
      writeUInt32LE(localOffset),
      name
    ]);

    locals.push(local);
    centrals.push(central);
    localOffset += local.length;
  }

  const centralOffset = localOffset;
  const centralBlob = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    writeUInt32LE(SIG_EOCD),
    writeUInt16LE(0),
    writeUInt16LE(0),
    writeUInt16LE(entries.length),
    writeUInt16LE(entries.length),
    writeUInt32LE(centralBlob.length),
    writeUInt32LE(centralOffset),
    writeUInt16LE(0)
  ]);
  return Buffer.concat([...locals, centralBlob, eocd]);
}

function findEocd(buffer) {
  const min = Math.max(0, buffer.length - 22 - 0xffff);
  for (let i = buffer.length - 22; i >= min; i -= 1) {
    if (readUInt32LE(buffer, i) === SIG_EOCD) return i;
  }
  return -1;
}
