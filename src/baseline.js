import fs from 'node:fs/promises';

export async function loadBaseline(file) {
  const raw = JSON.parse(await fs.readFile(file, 'utf8'));
  const ids = new Set(Array.isArray(raw) ? raw : raw.findingIds ?? []);
  return { ids, raw };
}

export async function writeBaseline(file, report) {
  const payload = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    target: report.target,
    findingIds: report.findings.map((item) => item.id).sort()
  };
  await fs.writeFile(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return payload;
}

export function applyBaseline(report, baseline, { includeBaselined = false } = {}) {
  let suppressed = 0;
  const findings = report.findings.flatMap((item) => {
    if (!baseline.ids.has(item.id)) return [item];
    suppressed += 1;
    return includeBaselined ? [{ ...item, baselined: true }] : [];
  });
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const item of findings) counts[item.severity] += 1;
  return {
    ...report,
    baseline: { suppressed, totalBaselineIds: baseline.ids.size },
    findings,
    summary: { total: findings.length, counts, removable: findings.filter((f) => f.removable).length }
  };
}
