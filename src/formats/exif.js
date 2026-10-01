const TAGS = {
  0x010e: 'ImageDescription',
  0x010f: 'Make',
  0x0110: 'Model',
  0x0131: 'Software',
  0x0132: 'DateTime',
  0x013b: 'Artist',
  0x8298: 'Copyright',
  0x8769: 'ExifIFD',
  0x8825: 'GPSIFD'
};

const EXIF_TAGS = {
  0x9003: 'DateTimeOriginal',
  0x9004: 'DateTimeDigitized',
  0xa420: 'ImageUniqueID',
  0xa431: 'BodySerialNumber',
  0xa434: 'LensModel',
  0xa435: 'LensSerialNumber',
  0x9286: 'UserComment'
};

export function parseExif(tiff) {
  if (!tiff || tiff.length < 8) return {};
  const endian = tiff.subarray(0, 2).toString();
  const little = endian === 'II';
  if (!little && endian !== 'MM') return {};

  const u16 = (o) => little ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o);
  const u32 = (o) => little ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o);
  if (u16(2) !== 42) return {};

  const out = {};
  const ifd0 = u32(4);
  const pointers = parseIfd(tiff, ifd0, little, TAGS, out);
  if (pointers.ExifIFD) parseIfd(tiff, pointers.ExifIFD, little, EXIF_TAGS, out);
  if (pointers.GPSIFD) parseGpsIfd(tiff, pointers.GPSIFD, little, out);
  return out;
}

function parseIfd(tiff, offset, little, tagMap, out) {
  if (!Number.isFinite(offset) || offset < 0 || offset + 2 > tiff.length) return {};
  const u16 = (o) => little ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o);
  const u32 = (o) => little ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o);
  const count = u16(offset);
  const pointers = {};

  for (let i = 0; i < count; i += 1) {
    const e = offset + 2 + i * 12;
    if (e + 12 > tiff.length) break;
    const tag = u16(e);
    const type = u16(e + 2);
    const valueCount = u32(e + 4);
    const name = tagMap[tag];
    if (!name) continue;
    const value = readValue(tiff, e + 8, type, valueCount, little);
    if (name.endsWith('IFD')) pointers[name] = Number(value);
    else if (value !== undefined && value !== '') out[name] = value;
  }
  return pointers;
}

function readValue(tiff, valueOffsetPos, type, count, little) {
  const sizes = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const size = (sizes[type] ?? 0) * count;
  if (!size) return undefined;
  const actual = size <= 4
    ? valueOffsetPos
    : (little ? tiff.readUInt32LE(valueOffsetPos) : tiff.readUInt32BE(valueOffsetPos));
  if (actual < 0 || actual + size > tiff.length) return undefined;

  if (type === 2) return tiff.subarray(actual, actual + count).toString('utf8').replace(/\0+$/, '').trim();
  if (type === 3 && count === 1) return little ? tiff.readUInt16LE(actual) : tiff.readUInt16BE(actual);
  if ((type === 4 || type === 9) && count === 1) return little ? tiff.readUInt32LE(actual) : tiff.readUInt32BE(actual);
  if (type === 7) {
    const raw = tiff.subarray(actual, actual + count);
    const ascii = raw.toString('utf8').replace(/^ASCII\0\0\0/, '').replace(/\0+$/, '').trim();
    return ascii || `<${count} bytes>`;
  }
  if (type === 5 && count === 1) return rational(tiff, actual, little);
  return undefined;
}

function parseGpsIfd(tiff, offset, little, out) {
  const u16 = (o) => little ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o);
  const u32 = (o) => little ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o);
  if (offset + 2 > tiff.length) return;
  const count = u16(offset);
  const gps = {};

  for (let i = 0; i < count; i += 1) {
    const e = offset + 2 + i * 12;
    if (e + 12 > tiff.length) break;
    const tag = u16(e);
    const type = u16(e + 2);
    const n = u32(e + 4);
    const valuePos = e + 8;
    if ((tag === 1 || tag === 3) && type === 2) gps[tag] = readValue(tiff, valuePos, type, n, little);
    if ((tag === 2 || tag === 4) && type === 5 && n === 3) {
      const p = u32(valuePos);
      if (p + 24 <= tiff.length) gps[tag] = [rational(tiff, p, little), rational(tiff, p + 8, little), rational(tiff, p + 16, little)];
    }
  }

  if (gps[2] && gps[4]) {
    let lat = dms(gps[2]);
    let lon = dms(gps[4]);
    if (gps[1] === 'S') lat *= -1;
    if (gps[3] === 'W') lon *= -1;
    out.GPSLatitude = lat;
    out.GPSLongitude = lon;
  }
}

function rational(tiff, offset, little) {
  const n = little ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset);
  const d = little ? tiff.readUInt32LE(offset + 4) : tiff.readUInt32BE(offset + 4);
  return d ? n / d : 0;
}

function dms([d, m, s]) {
  return d + m / 60 + s / 3600;
}
