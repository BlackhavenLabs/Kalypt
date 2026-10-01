import { finding, Severity } from '../model.js';
import { parseJpegMetadata } from '../formats/jpeg.js';
import { parsePngMetadata } from '../formats/png.js';

const IDENTITY_FIELDS = new Map([
  ['Artist', ['metadata.author', 'Author/artist metadata', Severity.MEDIUM]],
  ['Copyright', ['metadata.copyright', 'Copyright metadata', Severity.LOW]],
  ['BodySerialNumber', ['metadata.device-serial', 'Camera body serial number', Severity.HIGH]],
  ['LensSerialNumber', ['metadata.device-serial', 'Lens serial number', Severity.HIGH]],
  ['ImageUniqueID', ['metadata.unique-id', 'Image unique identifier', Severity.MEDIUM]]
]);

export function inspectImage(buffer, type, source) {
  const findings = [];
  let metadata = {};
  let removable = false;
  let cleaner;

  if (type === 'jpeg') {
    const parsed = parseJpegMetadata(buffer);
    metadata = parsed.exif ?? {};
    removable = Object.keys(metadata).length > 0 || parsed.hasIptc || Boolean(parsed.comment);
    cleaner = 'image.strip-metadata';
    if (parsed.hasIptc) findings.push(finding({
      severity: Severity.LOW,
      category: 'metadata.iptc',
      title: 'IPTC metadata block present',
      message: 'The JPEG contains an IPTC metadata block that may include attribution, captions, location, or workflow information.',
      source,
      removable: true,
      cleaner,
      tags: ['metadata', 'image']
    }));
    if (parsed.comment) findings.push(finding({
      severity: Severity.LOW,
      category: 'metadata.comment',
      title: 'JPEG comment present',
      message: 'The JPEG contains an embedded comment.',
      source,
      evidence: parsed.comment.slice(0, 180),
      removable: true,
      cleaner,
      tags: ['metadata', 'image']
    }));
  } else if (type === 'png') {
    const parsed = parsePngMetadata(buffer);
    metadata = { ...(parsed.metadata?.exif ?? {}), ...(parsed.metadata ?? {}) };
    delete metadata.exif;
    removable = Object.keys(metadata).length > 0;
    cleaner = 'image.strip-metadata';
  }

  if ('GPSLatitude' in metadata && 'GPSLongitude' in metadata) findings.push(finding({
    severity: Severity.HIGH,
    category: 'metadata.location',
    title: 'Precise GPS location',
    message: 'The image contains embedded GPS coordinates.',
    source,
    evidence: `${Number(metadata.GPSLatitude).toFixed(6)}, ${Number(metadata.GPSLongitude).toFixed(6)}`,
    removable: true,
    cleaner,
    tags: ['metadata', 'location', 'privacy']
  }));

  const make = metadata.Make;
  const model = metadata.Model;
  if (make || model) findings.push(finding({
    severity: Severity.LOW,
    category: 'metadata.device',
    title: 'Capture device information',
    message: 'The image identifies the device used to capture it.',
    source,
    evidence: [make, model].filter(Boolean).join(' '),
    removable: true,
    cleaner,
    tags: ['metadata', 'device']
  }));

  if (metadata.Software) findings.push(finding({
    severity: Severity.LOW,
    category: 'metadata.software',
    title: 'Editing software metadata',
    message: 'The image identifies software used to create or edit it.',
    source,
    evidence: String(metadata.Software),
    removable: true,
    cleaner,
    tags: ['metadata', 'software']
  }));

  const date = metadata.DateTimeOriginal ?? metadata.DateTimeDigitized ?? metadata.DateTime;
  if (date) findings.push(finding({
    severity: Severity.LOW,
    category: 'metadata.timestamp',
    title: 'Original capture timestamp',
    message: 'The image contains an embedded date/time.',
    source,
    evidence: String(date),
    removable: true,
    cleaner,
    tags: ['metadata', 'time']
  }));

  for (const [field, [category, title, severity]] of IDENTITY_FIELDS) {
    if (!metadata[field]) continue;
    findings.push(finding({
      severity,
      category,
      title,
      message: `The image contains ${field} metadata.`,
      source,
      evidence: String(metadata[field]),
      removable: true,
      cleaner,
      tags: ['metadata', 'identity']
    }));
  }

  if (removable && findings.length === 0) findings.push(finding({
    severity: Severity.INFO,
    category: 'metadata.present',
    title: 'Removable image metadata present',
    message: 'The image contains metadata that can be stripped without changing the pixel data.',
    source,
    removable: true,
    cleaner,
    tags: ['metadata', 'image']
  }));

  return findings;
}
