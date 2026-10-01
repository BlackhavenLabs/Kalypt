export function parseId3(buffer) {
  const result = { version: null, tagBytes: 0, frames: [] };
  if (buffer.subarray(0, 3).toString() !== 'ID3' || buffer.length < 10) return result;
  const major = buffer[3];
  result.version = `2.${major}.${buffer[4]}`;
  const size = synchsafe32(buffer, 6);
  result.tagBytes = Math.min(buffer.length, 10 + size);
  let offset = 10;

  while (offset + 10 <= result.tagBytes) {
    const id = buffer.subarray(offset, offset + 4).toString('latin1');
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const frameSize = major === 4 ? synchsafe32(buffer, offset + 4) : buffer.readUInt32BE(offset + 4);
    if (!frameSize || offset + 10 + frameSize > result.tagBytes) break;
    const data = buffer.subarray(offset + 10, offset + 10 + frameSize);
    result.frames.push({ id, value: decodeId3Frame(id, data), size: frameSize });
    offset += 10 + frameSize;
  }
  return result;
}

export function stripId3(buffer) {
  const parsed = parseId3(buffer);
  let start = parsed.tagBytes || 0;
  let end = buffer.length;
  if (end >= 128 && buffer.subarray(end - 128, end - 125).toString() === 'TAG') end -= 128;
  return Buffer.from(buffer.subarray(start, end));
}

export function parseWavInfo(buffer) {
  const items = [];
  if (buffer.subarray(0, 4).toString() !== 'RIFF' || buffer.subarray(8, 12).toString() !== 'WAVE') return items;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString('latin1');
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = Math.min(buffer.length, dataStart + size);
    if (id === 'LIST' && buffer.subarray(dataStart, dataStart + 4).toString() === 'INFO') {
      let p = dataStart + 4;
      while (p + 8 <= dataEnd) {
        const key = buffer.subarray(p, p + 4).toString('latin1');
        const len = buffer.readUInt32LE(p + 4);
        const valueStart = p + 8;
        const valueEnd = Math.min(dataEnd, valueStart + len);
        const value = buffer.subarray(valueStart, valueEnd).toString('utf8').replace(/\0+$/, '').trim();
        if (value) items.push({ key, value });
        p = valueEnd + (len % 2);
      }
    }
    offset = dataEnd + (size % 2);
  }
  return items;
}

export function stripWavInfo(buffer) {
  if (buffer.subarray(0, 4).toString() !== 'RIFF' || buffer.subarray(8, 12).toString() !== 'WAVE') throw new Error('Not a WAV');
  const chunks = [buffer.subarray(0, 12)];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.subarray(offset, offset + 4).toString('latin1');
    const size = buffer.readUInt32LE(offset + 4);
    const dataEnd = Math.min(buffer.length, offset + 8 + size);
    const paddedEnd = Math.min(buffer.length, dataEnd + (size % 2));
    const isInfo = id === 'LIST' && buffer.subarray(offset + 8, offset + 12).toString() === 'INFO';
    if (!isInfo) chunks.push(buffer.subarray(offset, paddedEnd));
    offset = paddedEnd;
  }
  const out = Buffer.concat(chunks);
  out.writeUInt32LE(Math.max(0, out.length - 8), 4);
  return out;
}

export function inspectMp4MetadataKeys(buffer) {
  const latin = buffer.toString('latin1');
  const keys = [
    ['©nam', 'Title'], ['©ART', 'Artist'], ['©alb', 'Album'], ['©day', 'Date'], ['©too', 'Encoder'],
    ['©cmt', 'Comment'], ['©cpy', 'Copyright'], ['©xyz', 'Location'], ['com.apple.quicktime.location.ISO6709', 'QuickTime location'],
    ['com.apple.quicktime.make', 'Device make'], ['com.apple.quicktime.model', 'Device model'], ['com.apple.quicktime.software', 'Software']
  ];
  return keys.filter(([needle]) => latin.includes(needle)).map(([key, label]) => ({ key, label }));
}

function synchsafe32(buffer, offset) {
  return ((buffer[offset] & 0x7f) << 21) |
    ((buffer[offset + 1] & 0x7f) << 14) |
    ((buffer[offset + 2] & 0x7f) << 7) |
    (buffer[offset + 3] & 0x7f);
}

function decodeId3Frame(id, data) {
  if (!data.length) return '';
  if (id.startsWith('T') && id !== 'TXXX') return decodeEncodedText(data[0], data.subarray(1));
  if (id === 'COMM' && data.length > 4) return decodeEncodedText(data[0], data.subarray(4));
  if (id === 'TXXX') return decodeEncodedText(data[0], data.subarray(1));
  if (id === 'PRIV') return data.subarray(0, Math.min(data.length, 80)).toString('latin1').replace(/\0/g, ' ').trim();
  if (id === 'APIC') return `<embedded artwork: ${data.length} bytes>`;
  return '';
}

function decodeEncodedText(encoding, data) {
  if (encoding === 0 || encoding === 3) return data.toString(encoding === 3 ? 'utf8' : 'latin1').replace(/\0+/g, ' ').trim();
  if (encoding === 1 || encoding === 2) {
    // Node's utf16le decoder covers the common BOM/little-endian case; swap bytes for BE marker.
    let payload = Buffer.from(data);
    if (encoding === 2 || (payload[0] === 0xfe && payload[1] === 0xff)) {
      if (payload[0] === 0xfe && payload[1] === 0xff) payload = payload.subarray(2);
      const swapped = Buffer.alloc(payload.length - (payload.length % 2));
      for (let i = 0; i + 1 < swapped.length; i += 2) { swapped[i] = payload[i + 1]; swapped[i + 1] = payload[i]; }
      payload = swapped;
    } else if (payload[0] === 0xff && payload[1] === 0xfe) payload = payload.subarray(2);
    return payload.toString('utf16le').replace(/\0+/g, ' ').trim();
  }
  return '';
}
