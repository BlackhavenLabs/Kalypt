export function renderHtmlReport(report) {
  const findings = report.findings.map((item) => `
    <article class="finding ${escapeHtml(item.severity)}">
      <header><span class="severity">${escapeHtml(item.severity)}</span><h2>${escapeHtml(item.title)}</h2></header>
      <p>${escapeHtml(item.message)}</p>
      <dl>
        <dt>Category</dt><dd><code>${escapeHtml(item.category)}</code></dd>
        <dt>Source</dt><dd><code>${escapeHtml(item.source)}</code></dd>
        ${item.path ? `<dt>Path</dt><dd><code>${escapeHtml(item.path)}</code></dd>` : ''}
        ${item.evidence ? `<dt>Evidence</dt><dd><code>${escapeHtml(String(item.evidence))}</code></dd>` : ''}
        ${item.removable ? `<dt>Cleaner</dt><dd><code>${escapeHtml(item.cleaner ?? 'available')}</code></dd>` : ''}
      </dl>
    </article>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kalypt report</title>
<style>
:root{font-family:Inter,ui-sans-serif,system-ui,sans-serif;color-scheme:light dark}body{max-width:1100px;margin:0 auto;padding:32px 20px;background:#111217;color:#ececf1}header.hero{margin-bottom:24px}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px}.card,.finding{background:#1b1d24;border:1px solid #30333d;border-radius:14px;padding:16px}.card strong{display:block;font-size:1.6rem}.finding{margin:12px 0;border-left-width:5px}.finding header{display:flex;gap:12px;align-items:center}.finding h2{font-size:1rem;margin:0}.severity{text-transform:uppercase;font-size:.72rem;font-weight:700;letter-spacing:.08em}.critical,.high{border-left-color:#ff6b6b}.medium{border-left-color:#ffd166}.low{border-left-color:#62b6ff}.info{border-left-color:#888}dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 14px}dt{color:#aaa}dd{margin:0;overflow-wrap:anywhere}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}small{color:#aaa}
</style>
</head>
<body>
<header class="hero"><h1>Kalypt report</h1><p><code>${escapeHtml(report.target)}</code></p>${report.policy ? `<p>Policy: <strong>${escapeHtml(report.policy.name)}</strong> — ${escapeHtml(report.policy.description)}</p>` : ''}</header>
<section class="summary">
  <div class="card"><small>Total</small><strong>${report.summary.total}</strong></div>
  <div class="card"><small>Critical</small><strong>${report.summary.counts.critical}</strong></div>
  <div class="card"><small>High</small><strong>${report.summary.counts.high}</strong></div>
  <div class="card"><small>Medium</small><strong>${report.summary.counts.medium}</strong></div>
  <div class="card"><small>Items</small><strong>${report.items.length}</strong></div>
</section>
<main>${findings || '<p>No findings.</p>'}</main>
</body></html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
