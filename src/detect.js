import path from 'node:path';

export function detectType(buffer, filePath = '') {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  const ext = path.extname(filePath).toLowerCase();

  if (starts(buffer, [0xff, 0xd8, 0xff])) return { kind: 'jpeg', mime: 'image/jpeg', ext };
  if (starts(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { kind: 'png', mime: 'image/png', ext };
  if (buffer.subarray(0, 5).toString() === '%PDF-') return { kind: 'pdf', mime: 'application/pdf', ext };
  if (starts(buffer, [0x50, 0x4b, 0x03, 0x04]) || starts(buffer, [0x50, 0x4b, 0x05, 0x06])) {
    return { kind: officeKindFromExt(ext) ?? 'zip', mime: mimeFromExt(ext) ?? 'application/zip', ext };
  }
  if (buffer.subarray(4, 8).toString() === 'ftyp') return { kind: 'mp4', mime: ext === '.m4a' ? 'audio/mp4' : 'video/mp4', ext };
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WAVE') return { kind: 'wav', mime: 'audio/wav', ext };
  if (buffer.subarray(0, 3).toString() === 'ID3' || starts(buffer, [0xff, 0xfb])) return { kind: 'mp3', mime: 'audio/mpeg', ext };

  const textLike = isProbablyText(buffer);
  return textLike
    ? { kind: 'text', mime: mimeFromExt(ext) ?? 'text/plain', ext }
    : { kind: 'binary', mime: mimeFromExt(ext) ?? 'application/octet-stream', ext };
}

function starts(buffer, bytes) {
  return bytes.every((byte, i) => buffer[i] === byte);
}

function officeKindFromExt(ext) {
  if (ext === '.docx') return 'docx';
  if (ext === '.xlsx') return 'xlsx';
  if (ext === '.pptx') return 'pptx';
  return null;
}

function mimeFromExt(ext) {
  return ({
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.json': 'application/json',
    '.md': 'text/markdown',
    '.csv': 'text/csv',
    '.js': 'text/javascript',
    '.ts': 'text/typescript'
  })[ext];
}

function isProbablyText(buffer) {
  if (buffer.length === 0) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 8192));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length < 0.02;
}
