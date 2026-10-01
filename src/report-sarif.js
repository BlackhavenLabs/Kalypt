export function renderSarif(report) {
  const categories = [...new Set(report.findings.map((item) => item.category))].sort();
  const rules = categories.map((category) => {
    const sample = report.findings.find((item) => item.category === category);
    return {
      id: category,
      shortDescription: { text: sample?.title ?? category },
      fullDescription: { text: sample?.message ?? category },
      properties: { tags: sample?.tags ?? [] }
    };
  });

  return JSON.stringify({
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'Kalypt', version: report.tool?.version ?? '0.1.0', informationUri: 'https://github.com/BlackhavenLabs/Kalypt', rules } },
      results: report.findings.filter((item) => item.severity !== 'info').map((item) => ({
        ruleId: item.category,
        level: sarifLevel(item.severity),
        message: { text: item.evidence ? `${item.message} Evidence: ${item.evidence}` : item.message },
        locations: [{ physicalLocation: { artifactLocation: { uri: normalizeUri(item.source) } } }],
        fingerprints: { 'kalypt/v1': item.id },
        properties: { severity: item.severity, confidence: item.confidence, removable: item.removable }
      }))
    }]
  }, null, 2);
}

function sarifLevel(severity) {
  if (severity === 'critical' || severity === 'high') return 'error';
  if (severity === 'medium') return 'warning';
  return 'note';
}

function normalizeUri(value) {
  return String(value).replace(/\\/g, '/').replace(/ /g, '%20');
}
