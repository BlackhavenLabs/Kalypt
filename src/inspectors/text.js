import { finding, Severity } from '../model.js';
import { inspectSecrets } from './secrets.js';

const WINDOWS_PATH = /\b[A-Za-z]:\\Users\\([^\\\s]+)\\[^\r\n"'<>]*/g;
const UNIX_HOME = /\/(?:Users|home)\/([^/\s]+)\/[^\r\n"'<>]*/g;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

export function inspectText(text, source, path, { secrets = true } = {}) {
  const findings = [];
  if (secrets) findings.push(...inspectSecrets(text, source, path));

  findings.push(...matchAll(text, WINDOWS_PATH, (match) => finding({
    severity: Severity.MEDIUM,
    category: 'identity.local-path',
    title: 'Local Windows user path',
    message: `A local filesystem path exposes the user/profile name “${match[1]}”.`,
    source, path, evidence: compact(match[0]), tags: ['identity', 'path']
  })));

  findings.push(...matchAll(text, UNIX_HOME, (match) => finding({
    severity: Severity.MEDIUM,
    category: 'identity.local-path',
    title: 'Local home-directory path',
    message: `A local filesystem path exposes the user/profile name “${match[1]}”.`,
    source, path, evidence: compact(match[0]), tags: ['identity', 'path']
  })));

  const emails = [...text.matchAll(EMAIL)].slice(0, 20);
  for (const match of emails) findings.push(finding({
    severity: Severity.LOW,
    category: 'identity.email',
    title: 'Email address present',
    message: 'An email address is embedded in the content.',
    source, path, evidence: match[0], tags: ['identity']
  }));

  return dedupe(findings);
}

function matchAll(text, regex, map) {
  regex.lastIndex = 0;
  return [...text.matchAll(regex)].slice(0, 20).map(map);
}

function compact(value) {
  return value.length > 140 ? `${value.slice(0, 137)}…` : value;
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.category}:${item.path}:${item.evidence}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
