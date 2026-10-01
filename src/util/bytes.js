export function readUInt16BE(buffer, offset) {
  return buffer[offset] * 256 + buffer[offset + 1];
}

export function readUInt16LE(buffer, offset) {
  return buffer[offset] + buffer[offset + 1] * 256;
}

export function readUInt32LE(buffer, offset) {
  return (buffer[offset] +
    buffer[offset + 1] * 256 +
    buffer[offset + 2] * 65536 +
    buffer[offset + 3] * 16777216) >>> 0;
}

export function writeUInt16LE(value) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value >>> 0);
  return b;
}

export function writeUInt32LE(value) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0);
  return b;
}

export function clampText(value, max = 180) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
