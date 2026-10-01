export const Severity = Object.freeze({
  INFO: 'info',
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  CRITICAL: 'critical'
});

export function finding({
  severity = Severity.INFO,
  category,
  title,
  message,
  source,
  path,
  evidence,
  removable = false,
  cleaner,
  confidence = 1,
  tags = []
}) {
  return {
    id: stableFindingId({ category, source, path, title, evidence }),
    severity,
    category,
    title,
    message,
    source,
    path,
    evidence,
    removable,
    cleaner,
    confidence,
    tags
  };
}

function stableFindingId(value) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `f_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function summarizeFindings(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const item of findings) counts[item.severity] = (counts[item.severity] ?? 0) + 1;
  return {
    total: findings.length,
    counts,
    removable: findings.filter((item) => item.removable).length
  };
}
