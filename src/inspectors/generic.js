import { finding, Severity } from '../model.js';
import { inspectText } from './text.js';
import { extractPrintableStrings } from '../util/text.js';

export function inspectGeneric(buffer, type, source, options = {}) {
  const findings = [];
  if (type.kind === 'text') {
    const text = buffer.toString('utf8');
    findings.push(...inspectText(text, source, source, { secrets: true }));
    if (/^\s*[\[{]/.test(text)) {
      try { JSON.parse(text); findings.push(finding({ severity: Severity.INFO, category: 'format.json-valid', title: 'Valid JSON', message: 'Content parses as JSON.', source, tags: ['format'] })); } catch { /* not JSON */ }
    }
  } else if (options.scanBinaryStrings) {
    const strings = extractPrintableStrings(buffer).join('\n');
    findings.push(...inspectText(strings, source, source, { secrets: true }));
  }
  return findings;
}
