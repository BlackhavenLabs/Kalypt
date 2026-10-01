const ICON = { critical: '✖', high: '▲', medium: '◆', low: '•', info: '·' };

export function renderTextReport(report, { color = process.stdout.isTTY } = {}) {
  const lines = [];
  lines.push(`Kalypt scan: ${report.target}`);
  lines.push(`${report.summary.total} finding(s) — ${report.summary.counts.critical} critical, ${report.summary.counts.high} high, ${report.summary.counts.medium} medium, ${report.summary.counts.low} low, ${report.summary.counts.info} info`);
  lines.push(`${report.items.length} item(s) inspected`);
  lines.push('');

  if (!report.findings.length) {
    lines.push('No findings.');
    return lines.join('\n');
  }

  for (const item of report.findings) {
    const level = item.severity.toUpperCase().padEnd(8);
    const symbol = ICON[item.severity] ?? '-';
    lines.push(`${symbol} ${paint(level, item.severity, color)} ${item.title}`);
    lines.push(`  ${item.message}`);
    if (item.path && item.path !== item.source) lines.push(`  Path: ${item.path}`);
    if (item.evidence) lines.push(`  Evidence: ${item.evidence}`);
    if (item.removable) lines.push(`  Cleaner: ${item.cleaner ?? 'available'}`);
    lines.push(`  Category: ${item.category}`);
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}

export function renderMarkdownReport(report) {
  const lines = [
    '# Kalypt report',
    '',
    `**Target:** \`${escapeMd(report.target)}\``,
    '',
    `**Summary:** ${report.summary.total} findings across ${report.items.length} inspected items.`,
    '',
    '| Severity | Count |',
    '| --- | ---: |',
    ...Object.entries(report.summary.counts).map(([severity, count]) => `| ${severity} | ${count} |`),
    '',
    '## Findings',
    ''
  ];
  if (!report.findings.length) lines.push('No findings.');
  for (const item of report.findings) {
    lines.push(`### ${item.severity.toUpperCase()}: ${item.title}`);
    lines.push('');
    lines.push(item.message);
    lines.push('');
    lines.push(`- Category: \`${escapeMd(item.category)}\``);
    lines.push(`- Source: \`${escapeMd(item.source)}\``);
    if (item.path) lines.push(`- Path: \`${escapeMd(item.path)}\``);
    if (item.evidence) lines.push(`- Evidence: \`${escapeMd(String(item.evidence))}\``);
    if (item.removable) lines.push(`- Cleaner: \`${escapeMd(item.cleaner ?? 'available')}\``);
    lines.push('');
  }
  return lines.join('\n');
}

function paint(text, severity, enabled) {
  if (!enabled) return text;
  const code = { critical: 31, high: 31, medium: 33, low: 36, info: 90 }[severity] ?? 0;
  return `\u001b[${code}m${text}\u001b[0m`;
}

function escapeMd(value) {
  return String(value).replace(/`/g, '\\`').replace(/\|/g, '\\|');
}
