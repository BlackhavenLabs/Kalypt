import { finding, Severity } from '../model.js';
import { inspectText } from './text.js';

const INFO_KEYS = ['Author', 'Creator', 'Producer', 'Title', 'Subject', 'Keywords', 'CreationDate', 'ModDate'];

export function inspectPdf(buffer, source) {
  const text = buffer.toString('latin1');
  const findings = [];

  for (const key of INFO_KEYS) {
    const value = extractPdfString(text, key);
    if (!value) continue;
    const severity = key === 'Author' ? Severity.MEDIUM : Severity.LOW;
    findings.push(finding({
      severity,
      category: `pdf.info.${key.toLowerCase()}`,
      title: `PDF ${key} metadata`,
      message: `The PDF document information dictionary contains ${key} metadata.`,
      source,
      evidence: value,
      removable: false,
      tags: ['pdf', 'metadata']
    }));
  }

  if (/\/EmbeddedFiles\b|\/Filespec\b/.test(text)) findings.push(finding({
    severity: Severity.MEDIUM,
    category: 'pdf.embedded-files',
    title: 'Embedded file content',
    message: 'The PDF appears to contain one or more embedded files.',
    source,
    tags: ['pdf', 'attachment']
  }));

  if (/\/JavaScript\b|\/JS\b/.test(text)) findings.push(finding({
    severity: Severity.HIGH,
    category: 'pdf.javascript',
    title: 'PDF JavaScript',
    message: 'The PDF contains JavaScript-related objects and should be reviewed before sharing or opening in a privileged environment.',
    source,
    tags: ['pdf', 'active-content', 'security']
  }));

  if (/\/OpenAction\b/.test(text)) findings.push(finding({
    severity: Severity.MEDIUM,
    category: 'pdf.open-action',
    title: 'Automatic open action',
    message: 'The PDF defines an action that may run when the document is opened.',
    source,
    tags: ['pdf', 'active-content']
  }));

  if (/\/Encrypt\b/.test(text)) findings.push(finding({
    severity: Severity.INFO,
    category: 'pdf.encrypted',
    title: 'PDF encryption present',
    message: 'The PDF declares an encryption dictionary; some content may not be inspectable without a password.',
    source,
    tags: ['pdf', 'encryption']
  }));

  if (/<x:xmpmeta\b|<rdf:RDF\b/i.test(text)) findings.push(finding({
    severity: Severity.LOW,
    category: 'pdf.xmp',
    title: 'XMP metadata present',
    message: 'The PDF contains an XMP metadata packet, which may duplicate or extend document metadata.',
    source,
    tags: ['pdf', 'metadata']
  }));

  // Printable strings are imperfect for PDFs, but useful for accidental local paths/emails.
  findings.push(...inspectText(text, source, source, { secrets: true }).filter((f) =>
    f.category === 'identity.local-path' || f.category.startsWith('secret.')
  ));
  return dedupe(findings);
}

function extractPdfString(text, key) {
  const regex = new RegExp(`\\/${key}\\s*\\(([^)]{1,500})\\)`);
  const match = text.match(regex);
  return match ? decodePdfLiteral(match[1]).slice(0, 180) : null;
}

function decodePdfLiteral(value) {
  return value.replace(/\\([nrtbf()\\])/g, (_, c) => ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }[c] ?? c));
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}
