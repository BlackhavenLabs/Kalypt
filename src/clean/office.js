import { readZip, writeZip } from '../formats/zip.js';

const CORE_CLEAR_TAGS = [
  'dc:creator',
  'cp:lastModifiedBy',
  'cp:lastPrinted',
  'cp:revision',
  'dcterms:created',
  'dcterms:modified'
];

export function cleanOfficeProperties(buffer, options = {}) {
  const entries = readZip(buffer, options.zipSafety);
  return writeZip(entries.map((entry) => {
    if (entry.name === 'docProps/core.xml') {
      let xml = entry.data.toString('utf8');
      for (const tag of CORE_CLEAR_TAGS) {
        const re = new RegExp(`<${escape(tag)}([^>]*)>[\\s\\S]*?<\\/${escape(tag)}>`, 'g');
        xml = xml.replace(re, `<${tag}$1></${tag}>`);
      }
      return { ...entry, data: Buffer.from(xml, 'utf8') };
    }
    if (entry.name === 'docProps/custom.xml' && options.removeCustomProperties !== false) {
      return null;
    }
    return entry;
  }).filter(Boolean));
}

function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
