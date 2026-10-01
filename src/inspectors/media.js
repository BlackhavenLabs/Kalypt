import { finding, Severity } from '../model.js';
import { parseId3, parseWavInfo, inspectMp4MetadataKeys } from '../formats/media.js';

const ID3_LABELS = {
  TIT2: 'Title', TPE1: 'Artist', TALB: 'Album', TCON: 'Genre', TDRC: 'Date', TYER: 'Year',
  COMM: 'Comment', TXXX: 'Custom text', PRIV: 'Private frame', APIC: 'Embedded artwork',
  TCOP: 'Copyright', TENC: 'Encoded by', TSSE: 'Encoding software'
};

const WAV_LABELS = {
  IART: 'Artist', INAM: 'Name', ICMT: 'Comment', ISFT: 'Software', ICRD: 'Creation date',
  ICOP: 'Copyright', IENG: 'Engineer', ISBJ: 'Subject', IGNR: 'Genre'
};

export function inspectMedia(buffer, kind, source) {
  if (kind === 'mp3') return inspectMp3(buffer, source);
  if (kind === 'wav') return inspectWav(buffer, source);
  if (kind === 'mp4') return inspectMp4(buffer, source);
  return [];
}

function inspectMp3(buffer, source) {
  const parsed = parseId3(buffer);
  const findings = [];
  for (const frame of parsed.frames) {
    const label = ID3_LABELS[frame.id];
    if (!label) continue;
    const sensitive = ['COMM', 'TXXX', 'PRIV', 'TENC', 'TSSE'].includes(frame.id);
    findings.push(finding({
      severity: sensitive ? Severity.MEDIUM : Severity.LOW,
      category: `media.id3.${frame.id.toLowerCase()}`,
      title: `ID3 ${label.toLowerCase()}`,
      message: `The MP3 contains an ID3 ${label.toLowerCase()} frame.`,
      source,
      evidence: frame.value ? String(frame.value).slice(0, 180) : `${frame.size} bytes`,
      removable: true,
      cleaner: 'media.strip-metadata',
      tags: ['media', 'metadata', 'id3']
    }));
  }
  if (parsed.tagBytes && !findings.length) findings.push(finding({
    severity: Severity.INFO,
    category: 'media.id3.present',
    title: 'ID3 metadata present',
    message: `The MP3 contains an ${parsed.version ?? 'ID3'} metadata tag.`,
    source,
    removable: true,
    cleaner: 'media.strip-metadata',
    tags: ['media', 'metadata']
  }));
  return findings;
}

function inspectWav(buffer, source) {
  return parseWavInfo(buffer).map((item) => finding({
    severity: ['ICMT', 'IENG', 'ISFT'].includes(item.key) ? Severity.MEDIUM : Severity.LOW,
    category: `media.wav.${item.key.toLowerCase()}`,
    title: `WAV ${WAV_LABELS[item.key] ?? item.key} metadata`,
    message: 'The WAV RIFF INFO list contains descriptive metadata.',
    source,
    evidence: item.value.slice(0, 180),
    removable: true,
    cleaner: 'media.strip-metadata',
    tags: ['media', 'metadata', 'wav']
  }));
}

function inspectMp4(buffer, source) {
  return inspectMp4MetadataKeys(buffer).map((item) => finding({
    severity: /location/i.test(item.label) ? Severity.HIGH : Severity.LOW,
    category: `media.mp4.${slug(item.label)}`,
    title: `${item.label} metadata key`,
    message: `The MP4/MOV container contains a ${item.label.toLowerCase()} metadata key.`,
    source,
    removable: false,
    tags: ['media', 'metadata', 'mp4']
  }));
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
