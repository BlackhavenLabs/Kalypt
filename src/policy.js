import { summarizeFindings } from './model.js';

const POLICIES = {
  public: {
    description: 'General-purpose public sharing policy.',
    overrides: []
  },
  'photo-share': {
    description: 'Prioritize location, device identifiers, authorship, and timestamps in images/media.',
    overrides: [
      ['metadata.location', 'critical'],
      ['metadata.device-serial', 'high'],
      ['metadata.author', 'high'],
      ['metadata.timestamp', 'medium'],
      ['media.mp4.quicktime-location', 'critical']
    ]
  },
  'source-release': {
    description: 'Prioritize secrets, local paths, sensitive files, and repository identity/history before source publication.',
    overrides: [
      ['secret.', 'critical'],
      ['git.sensitive-file', 'critical'],
      ['git.local-sensitive-file-unignored', 'critical'],
      ['identity.local-path', 'high'],
      ['git.author-identity', 'medium']
    ]
  },
  'job-application': {
    description: 'Prioritize document revision residue, comments, hidden content, identity, and local paths in application materials.',
    overrides: [
      ['office.comments', 'high'],
      ['office.speaker-notes', 'high'],
      ['office.hidden-sheet', 'high'],
      ['office.custom-properties', 'high'],
      ['identity.local-path', 'high'],
      ['office.core.dc-creator', 'medium'],
      ['office.core.cp-lastModifiedBy', 'high']
    ]
  }
};

export function policyNames() {
  return Object.keys(POLICIES);
}

export function applyPolicy(report, name = 'public') {
  const policy = POLICIES[name];
  if (!policy) throw new Error(`Unknown policy “${name}”. Available: ${policyNames().join(', ')}`);
  const findings = report.findings.map((item) => {
    let severity = item.severity;
    for (const [prefix, replacement] of policy.overrides) {
      if (item.category === prefix || item.category.startsWith(prefix)) severity = maxSeverity(severity, replacement);
    }
    return severity === item.severity ? item : { ...item, severity, policyAdjusted: true };
  });
  return {
    ...report,
    policy: { name, description: policy.description },
    findings,
    summary: summarizeFindings(findings)
  };
}

function maxSeverity(a, b) {
  const rank = { info: 1, low: 2, medium: 3, high: 4, critical: 5 };
  return rank[b] > rank[a] ? b : a;
}
