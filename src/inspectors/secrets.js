import { finding, Severity } from '../model.js';

const RULES = [
  { id: 'aws-access-key', title: 'AWS access key candidate', severity: Severity.CRITICAL, regex: /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { id: 'github-token', title: 'GitHub token candidate', severity: Severity.CRITICAL, regex: /\bgh[pousr]_[A-Za-z0-9_]{20,255}\b/g },
  { id: 'private-key', title: 'Private key material', severity: Severity.CRITICAL, regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: 'slack-token', title: 'Slack token candidate', severity: Severity.HIGH, regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { id: 'generic-secret', title: 'Hard-coded secret candidate', severity: Severity.HIGH, regex: /\b(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*["']?([A-Za-z0-9_\-\/.+=]{16,})["']?/gi }
];

export function inspectSecrets(text, source, path) {
  const findings = [];
  for (const rule of RULES) {
    rule.regex.lastIndex = 0;
    let match;
    let count = 0;
    while ((match = rule.regex.exec(text)) && count < 20) {
      const value = match[1] ?? match[0];
      if (rule.id === 'generic-secret' && (matchesSpecificSecret(value) || !looksSecretLike(value))) {
        if (match[0].length === 0) rule.regex.lastIndex += 1;
        continue;
      }
      findings.push(finding({
        severity: rule.severity,
        category: `secret.${rule.id}`,
        title: rule.title,
        message: 'Potential secret material is present and should be reviewed before sharing.',
        source,
        path,
        evidence: redact(value),
        removable: false,
        confidence: rule.id === 'generic-secret' ? 0.7 : 0.95,
        tags: ['secret', 'security']
      }));
      count += 1;
      if (match[0].length === 0) rule.regex.lastIndex += 1;
    }
  }
  return dedupe(findings);
}



function matchesSpecificSecret(value) {
  const text = String(value);
  return /(?:^|[^A-Z0-9])(?:AKIA|ASIA)[A-Z0-9]{16}(?:$|[^A-Z0-9])/i.test(text) ||
    /gh[pousr]_[A-Za-z0-9_]{20,255}/.test(text) ||
    /xox[baprs]-[A-Za-z0-9-]{10,}/.test(text) ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text);
}

function looksSecretLike(value) {
  const text = String(value);
  const classes = [/[a-z]/.test(text), /[A-Z]/.test(text), /\d/.test(text), /[_\-\/.+=]/.test(text)].filter(Boolean).length;
  if (classes < 2) return false;
  const frequencies = new Map();
  for (const ch of text) frequencies.set(ch, (frequencies.get(ch) ?? 0) + 1);
  let entropy = 0;
  for (const count of frequencies.values()) {
    const p = count / text.length;
    entropy -= p * Math.log2(p);
  }
  return entropy >= 3.0;
}

function redact(value) {
  const text = String(value);
  if (text.length <= 8) return '••••';
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
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
