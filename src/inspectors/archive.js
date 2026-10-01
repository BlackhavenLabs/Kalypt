import path from 'node:path';
import { readZip } from '../formats/zip.js';
import { finding, Severity } from '../model.js';

export function inspectZip(buffer, source, options = {}) {
  try {
    const entries = readZip(buffer, options.zipSafety);
    const findings = [finding({
      severity: Severity.INFO,
      category: 'archive.summary',
      title: 'Archive contents',
      message: `ZIP contains ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}.`,
      source,
      tags: ['archive', 'summary']
    })];

    const suspicious = entries.filter((entry) => {
      const name = entry.name.toLowerCase();
      return /(^|\/)(\.env(?:\.|$)|id_rsa$|id_ed25519$|credentials(?:\.|$)|secrets?(?:\.|$)|\.npmrc$|\.pypirc$)/.test(name);
    });
    for (const entry of suspicious.slice(0, 30)) findings.push(finding({
      severity: Severity.HIGH,
      category: 'archive.sensitive-name',
      title: 'Potentially sensitive file in archive',
      message: 'The archive contains a filename commonly associated with credentials or secrets.',
      source,
      path: entry.name,
      evidence: path.basename(entry.name),
      tags: ['archive', 'secret']
    }));

    const traversal = entries.filter((entry) => entry.name.split(/[\\/]+/).includes('..') || path.isAbsolute(entry.name));
    for (const entry of traversal.slice(0, 20)) findings.push(finding({
      severity: Severity.HIGH,
      category: 'archive.path-traversal',
      title: 'Unsafe archive path',
      message: 'An archive entry uses an absolute or parent-relative path.',
      source,
      path: entry.name,
      tags: ['archive', 'security']
    }));
    return findings;
  } catch (error) {
    return [finding({
      severity: Severity.HIGH,
      category: 'archive.invalid',
      title: 'Could not safely inspect ZIP archive',
      message: error.message,
      source,
      tags: ['archive']
    })];
  }
}
