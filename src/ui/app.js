const state = { entries: [], selected: 0, policy: 'public', viewMode: 'file' };
const $ = (id) => document.getElementById(id);
const dropzone = $('dropzone');
const fileInput = $('file-input');
const folderInput = $('folder-input');

boot().catch(showFatal);

async function boot() {
  const meta = await fetch('/api/meta').then((r) => r.json());
  for (const policy of meta.policies) {
    const option = document.createElement('option');
    option.value = policy;
    option.textContent = policy.replaceAll('-', ' ');
    $('policy').append(option);
  }

  $('policy').value = state.policy;
  $('policy').addEventListener('change', () => {
    state.policy = $('policy').value;
    rescanAll();
  });

  $('choose-files').addEventListener('click', () => fileInput.click());
  $('choose-folder').addEventListener('click', () => folderInput.click());
  fileInput.addEventListener('change', () => consumePicker(fileInput));
  folderInput.addEventListener('change', () => consumePicker(folderInput));

  $('view-all').addEventListener('click', () => setViewMode('all'));
  $('view-file').addEventListener('click', () => setViewMode('file'));

  dropzone.addEventListener('click', (event) => {
    if (event.target === dropzone) fileInput.click();
  });
  dropzone.addEventListener('keydown', (event) => {
    if (event.target === dropzone && (event.key === 'Enter' || event.key === ' ')) fileInput.click();
  });

  for (const event of ['dragenter', 'dragover']) {
    dropzone.addEventListener(event, (e) => {
      e.preventDefault();
      dropzone.classList.add('drag');
    });
  }
  for (const event of ['dragleave', 'drop']) {
    dropzone.addEventListener(event, (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag');
    });
  }
  dropzone.addEventListener('drop', (event) => inspectFiles([...event.dataTransfer.files]));

  $('clean-button').addEventListener('click', cleanSelected);

  const privacy = $('privacy-details');
  document.addEventListener('click', (event) => {
    if (privacy?.open && !privacy.contains(event.target)) privacy.open = false;
    for (const menu of document.querySelectorAll('.export-menu[open]')) {
      if (!menu.contains(event.target)) menu.open = false;
    }
  });

  const backToTop = $('back-to-top');
  backToTop.addEventListener('click', () => dropzone.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  const syncBackToTop = () => {
    backToTop.classList.toggle('hidden', window.scrollY < dropzone.offsetTop + 120);
  };
  window.addEventListener('scroll', syncBackToTop, { passive: true });
  window.addEventListener('resize', syncBackToTop);
  syncBackToTop();
}

function consumePicker(input) {
  const files = [...input.files];
  input.value = '';
  inspectFiles(files);
}

async function inspectFiles(files) {
  if (!files.length) return;

  state.entries = files.map((file) => ({ file, report: null, error: null, status: 'queued' }));
  state.selected = 0;
  state.viewMode = files.length > 1 ? 'all' : 'file';
  $('queue').classList.remove('hidden');
  $('result').classList.add('hidden');
  renderInspection();

  for (let i = 0; i < state.entries.length; i += 1) {
    await inspectOne(i);
    renderInspection();
    if (state.viewMode === 'all' || i === state.selected) renderResults();
  }
}

async function inspectOne(index) {
  const entry = state.entries[index];
  entry.status = 'scanning';
  renderInspection();

  try {
    const logicalName = entryName(entry);
    const response = await fetch(`/api/scan?name=${encodeURIComponent(logicalName)}&policy=${encodeURIComponent(state.policy)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: entry.file
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || `Scan failed (${response.status})`);
    entry.report = body;
    entry.error = null;
    entry.status = 'done';
  } catch (error) {
    entry.error = error.message;
    entry.status = 'error';
  }
}

async function rescanAll() {
  if (!state.entries.length) return;
  for (let i = 0; i < state.entries.length; i += 1) await inspectOne(i);
  renderInspection();
  renderResults();
}

function setViewMode(mode) {
  if (mode === 'all' && state.entries.length < 2) return;
  state.viewMode = mode;
  renderInspection();
  renderResults();
}

function renderInspection() {
  const tabs = $('file-tabs');
  tabs.replaceChildren();

  const multi = state.entries.length > 1;
  $('view-switch').classList.toggle('hidden', !multi);
  $('view-all').classList.toggle('active', state.viewMode === 'all');
  $('view-file').classList.toggle('active', state.viewMode === 'file');
  $('view-all').setAttribute('aria-pressed', String(state.viewMode === 'all'));
  $('view-file').setAttribute('aria-pressed', String(state.viewMode === 'file'));

  const completed = state.entries.filter((entry) => entry.status === 'done' || entry.status === 'error').length;
  $('queue-status').textContent = completed < state.entries.length ? `${completed}/${state.entries.length} inspected` : '';

  if (state.viewMode === 'all') {
    tabs.classList.add('hidden');
    return;
  }

  tabs.classList.remove('hidden');
  state.entries.forEach((entry, index) => {
    const button = document.createElement('button');
    button.className = `file-tab${index === state.selected ? ' active' : ''}${entry.error ? ' error' : ''}`;
    const prefix = entry.status === 'scanning' ? 'Scanning · ' : entry.error ? 'Error · ' : '';
    button.textContent = `${prefix}${entryName(entry)}`;
    button.title = button.textContent;
    button.addEventListener('click', () => {
      state.selected = index;
      renderInspection();
      renderResults();
    });
    tabs.append(button);
  });
}

function renderResults() {
  const result = $('result');
  result.classList.remove('hidden');
  result.classList.toggle('all-mode', state.viewMode === 'all');

  const view = currentView();
  const root = $('findings');
  root.replaceChildren();

  if (!view.reports.length) {
    setSummary(0, 0, 0, 0);
    $('clean-button').classList.add('hidden');
    $('clean-note').textContent = '';
    root.innerHTML = '<div class="empty">Scanning…</div>';
    return;
  }

  if (view.error) {
    setSummary('—', '—', '—', '—');
    $('clean-button').classList.add('hidden');
    $('clean-note').textContent = '';
    root.innerHTML = `<div class="finding-row high"><div class="finding-main"><h3>Could not inspect this file</h3><p class="finding-message">${escapeHtml(view.error)}</p></div></div>`;
    return;
  }

  const findings = view.findings;
  const details = view.details;
  const dangerCount = findings.filter((item) => item.severity === 'critical' || item.severity === 'high').length;
  const removableCount = findings.filter((item) => item.removable).length;
  setSummary(findings.length, dangerCount, removableCount, view.itemCount);

  const cleanButton = $('clean-button');
  const canClean = state.viewMode === 'file' && removableCount > 0;
  cleanButton.classList.toggle('hidden', !canClean);
  cleanButton.disabled = !canClean;

  if (state.viewMode === 'all') {
    $('clean-note').textContent = '';
  } else {
    $('clean-note').textContent = removableCount > 0
      ? 'Cleaning creates a new copy; the original stays untouched.'
      : findings.length > 0
        ? 'No safe built-in cleaner is available for the current findings.'
        : '';
  }

  root.append(renderInspectionDetails(details, view));

  const groups = groupFindings(findings);
  const hasExpandableGroups = groups.some((group) => group.matches.length > 1);
  const header = document.createElement('div');
  header.className = 'findings-header';
  header.innerHTML = `
    <h2>Findings</h2>
    <div class="findings-actions">
      <span>${findings.length} total</span>
      ${hasExpandableGroups ? '<button type="button" class="secondary compact findings-toggle">Expand all</button>' : ''}
    </div>`;
  header.querySelector('.findings-actions').append(createExportMenu());
  root.append(header);

  if (findings.length) {
    const list = document.createElement('div');
    list.className = 'finding-list';
    for (const group of groups) list.append(renderFindingGroup(group, view.currentPath));
    root.append(list);

    const toggle = header.querySelector('.findings-toggle');
    if (toggle) {
      const expanders = [...list.querySelectorAll('details.more-details')];
      const syncToggle = () => {
        toggle.textContent = expanders.every((detailsEl) => detailsEl.open) ? 'Collapse all' : 'Expand all';
      };
      toggle.addEventListener('click', () => {
        const shouldOpen = !expanders.every((detailsEl) => detailsEl.open);
        for (const detailsEl of expanders) detailsEl.open = shouldOpen;
        syncToggle();
      });
      for (const detailsEl of expanders) detailsEl.addEventListener('toggle', syncToggle);
      syncToggle();
    }
  } else {
    const clear = document.createElement('div');
    clear.className = 'clear-state';
    clear.innerHTML = '<strong>No findings</strong><span>Nothing requiring review under this policy.</span>';
    root.append(clear);
  }
}

function createExportMenu() {
  const menu = document.createElement('details');
  menu.className = 'export-menu';
  menu.innerHTML = `
    <summary>Export report</summary>
    <div class="export-options">
      <button type="button" data-export-format="html">HTML</button>
      <button type="button" data-export-format="csv">CSV</button>
      <button type="button" data-export-format="json">JSON</button>
    </div>`;

  for (const button of menu.querySelectorAll('[data-export-format]')) {
    button.addEventListener('click', () => {
      exportReport(button.dataset.exportFormat);
      menu.open = false;
    });
  }
  return menu;
}

function currentView() {
  if (state.viewMode === 'all') {
    const entries = state.entries.filter((entry) => entry.report && !entry.error);
    const findings = [];
    const details = [];
    let itemCount = 0;

    for (const entry of entries) {
      const sourceFile = entryName(entry);
      itemCount += entry.report.items?.length || 0;
      for (const item of entry.report.findings || []) {
        const normalized = { ...item, sourceFile };
        if (normalized.severity === 'info') details.push(normalized);
        else findings.push(normalized);
      }
    }

    return { reports: entries, findings, details, itemCount, currentPath: null, error: null };
  }

  const entry = state.entries[state.selected];
  if (!entry) return { reports: [], findings: [], details: [], itemCount: 0, currentPath: null, error: null };
  if (entry.error) return { reports: [entry], findings: [], details: [], itemCount: 0, currentPath: entryName(entry), error: entry.error };
  if (!entry.report) return { reports: [], findings: [], details: [], itemCount: 0, currentPath: entryName(entry), error: null };

  const findings = (entry.report.findings || []).filter((item) => item.severity !== 'info');
  const details = (entry.report.findings || []).filter((item) => item.severity === 'info');
  return {
    reports: [entry],
    findings,
    details,
    itemCount: entry.report.items?.length || 0,
    currentPath: entryName(entry),
    error: null
  };
}

function setSummary(total, danger, removable, items) {
  $('total-count').textContent = total;
  $('danger-count').textContent = danger;
  $('removable-count').textContent = removable;
  $('item-count').textContent = items;
}

function groupFindings(findings) {
  const groups = new Map();
  for (const item of findings) {
    const key = JSON.stringify([
      item.severity,
      item.title,
      item.category,
      Boolean(item.removable)
    ]);
    if (!groups.has(key)) groups.set(key, { ...item, matches: [] });
    groups.get(key).matches.push(item);
  }

  const severityRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  return [...groups.values()].sort((a, b) => {
    const rankA = severityRank[a.severity] ?? 99;
    const rankB = severityRank[b.severity] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return String(a.title).localeCompare(String(b.title));
  });
}

function renderFindingGroup(group, currentPath) {
  const row = document.createElement('article');
  row.className = `finding-row ${group.severity}`;
  const count = group.matches.length;
  const clean = group.removable ? '<span class="cleanable">Removable</span>' : '';
  const showMessage = !isRedundantMessage(group.title, group.message);

  row.innerHTML = `
    <div class="finding-main">
      <div class="finding-head">
        <span class="pill">${escapeHtml(group.severity)}</span>
        <h3>${escapeHtml(group.title)}</h3>
        ${clean}
      </div>
      ${showMessage ? `<p class="finding-message">${escapeHtml(group.message)}</p>` : ''}
      ${renderMatchPreview(group.matches, currentPath)}
    </div>
    <span class="finding-count">${count} ${count === 1 ? 'match' : 'matches'}</span>`;
  return row;
}

function renderMatchPreview(matches, currentPath) {
  if (!matches.length) return '';
  const first = renderMatchRow(matches[0], currentPath);
  const preview = first ? `<div class="match-preview">${first}</div>` : '';
  if (matches.length === 1) return preview;

  const remaining = matches.slice(1).map((item) => renderMatchRow(item, currentPath)).filter(Boolean).join('');
  return `
    ${preview}
    <details class="more-details">
      <summary>Show ${matches.length - 1} more</summary>
      ${remaining ? `<div class="more-list">${remaining}</div>` : ''}
    </details>`;
}

function renderMatchRow(item, currentPath) {
  const parts = [];
  if (item.sourceFile) {
    parts.push(`<span>File: <code>${escapeHtml(item.sourceFile)}</code></span>`);
  }
  if (item.evidence !== undefined && item.evidence !== null && String(item.evidence) !== '') {
    parts.push(`<span>Evidence: <code>${escapeHtml(String(item.evidence))}</code></span>`);
  }
  if (item.path && item.path !== currentPath && item.path !== item.sourceFile) {
    parts.push(`<span>Path: <code>${escapeHtml(item.path)}</code></span>`);
  }
  return parts.length ? `<div class="match-row">${parts.join('')}</div>` : '';
}

function renderInspectionDetails(details, view) {
  const groups = groupFindings(details);
  const wrapper = document.createElement('details');
  wrapper.className = 'inspection-details';
  const inspectedCount = state.viewMode === 'all'
    ? state.entries.filter((entry) => entry.status === 'done').length
    : 1;
  wrapper.innerHTML = `<summary>Inspection details <span>${inspectedCount} ${inspectedCount === 1 ? 'file' : 'files'}</span></summary>`;

  const list = document.createElement('div');
  list.className = 'inspection-detail-list';

  const scopeRow = document.createElement('div');
  scopeRow.className = 'inspection-detail-row';
  scopeRow.innerHTML = `<strong>Scope</strong><span>${state.viewMode === 'all' ? 'All inspected files' : escapeHtml(view.currentPath || 'Selected file')}</span>`;
  list.append(scopeRow);

  const policyRow = document.createElement('div');
  policyRow.className = 'inspection-detail-row';
  policyRow.innerHTML = `<strong>Policy</strong><span>${escapeHtml(state.policy.replaceAll('-', ' '))}</span>`;
  list.append(policyRow);

  for (const group of groups) {
    const row = document.createElement('div');
    row.className = 'inspection-detail-row';
    const message = isRedundantMessage(group.title, group.message) ? '' : group.message;
    row.innerHTML = `<strong>${escapeHtml(group.title)}</strong>${message ? `<span>${escapeHtml(message)}</span>` : ''}${group.matches.length > 1 ? `<em>${group.matches.length} matches</em>` : ''}`;
    list.append(row);
  }
  wrapper.append(list);
  return wrapper;
}

function isRedundantMessage(title, message) {
  const text = String(message || '').trim();
  if (!text) return true;
  const normalized = text.toLowerCase();
  const redundantPatterns = [
    /^potential secret material is present and should be reviewed before sharing\.?$/,
    /^the image contains .* metadata\.?$/,
    /^the jpeg contains an embedded comment\.?$/,
    /^the image identifies the device used to capture it\.?$/,
    /^the image identifies software used to create or edit it\.?$/,
    /^the image contains an embedded date\/time\.?$/,
    /^an email address is embedded in the content\.?$/
  ];
  if (redundantPatterns.some((pattern) => pattern.test(normalized))) return true;

  const titleWords = new Set(String(title || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 3));
  const messageWords = new Set(normalized.replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 3));
  if (!titleWords.size || !messageWords.size) return false;
  const overlap = [...titleWords].filter((word) => messageWords.has(word)).length;
  return overlap / titleWords.size >= 0.75 && messageWords.size <= titleWords.size + 4;
}

async function cleanSelected() {
  const entry = state.entries[state.selected];
  if (!entry?.file || state.viewMode !== 'file') return;

  $('clean-button').disabled = true;
  $('clean-note').textContent = 'Creating and verifying clean copy…';
  try {
    const response = await fetch(`/api/clean?name=${encodeURIComponent(entry.file.name)}&policy=${encodeURIComponent(state.policy)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: entry.file
    });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error || 'Clean failed');
    }

    const findingsAfter = response.headers.get('x-kalypt-findings-after');
    const blob = await response.blob();
    const disposition = response.headers.get('content-disposition') || '';
    const name = disposition.match(/filename="([^"]+)"/)?.[1] || `cleaned-${entry.file.name}`;
    download(blob, name);
    $('clean-note').textContent = findingsAfter === null
      ? `Created ${name}.`
      : `Created ${name}. Verification found ${findingsAfter} remaining finding(s) under the ${state.policy} policy.`;
  } catch (error) {
    $('clean-note').textContent = error.message;
  } finally {
    $('clean-button').disabled = false;
  }
}

function exportReport(format) {
  const view = currentView();
  if (!view.reports.length) return;
  const stem = exportStem(view.reports);

  if (format === 'json') {
    const payload = state.viewMode === 'all'
      ? {
          exportedAt: new Date().toISOString(),
          policy: state.policy,
          scope: 'all',
          reports: view.reports.map((entry) => entry.report)
        }
      : view.reports[0].report;
    download(new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: 'application/json' }), `${stem}.json`);
    return;
  }

  if (format === 'csv') {
    download(new Blob([renderCsv(view)], { type: 'text/csv;charset=utf-8' }), `${stem}.csv`);
    return;
  }

  download(new Blob([renderHtmlExport(view)], { type: 'text/html;charset=utf-8' }), `${stem}.html`);
}

function renderCsv(view) {
  const header = ['severity', 'title', 'category', 'removable', 'source_file', 'path', 'evidence', 'message'];
  const rows = [header];
  for (const item of [...view.findings, ...view.details]) {
    rows.push([
      item.severity,
      item.title,
      item.category,
      item.removable ? 'yes' : 'no',
      item.sourceFile || (state.viewMode === 'file' ? view.currentPath : ''),
      item.path || '',
      item.evidence ?? '',
      item.message || ''
    ]);
  }
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function renderHtmlExport(view) {
  const dangerCount = view.findings.filter((item) => item.severity === 'critical' || item.severity === 'high').length;
  const removableCount = view.findings.filter((item) => item.removable).length;
  const scope = state.viewMode === 'all' ? `${view.reports.length} files` : entryName(view.reports[0]);

  const rows = groupFindings(view.findings).map((group) => {
    const matches = group.matches.map((item) => {
      const bits = [];
      if (item.sourceFile) bits.push(`File: <code>${escapeHtml(item.sourceFile)}</code>`);
      if (item.path && item.path !== item.sourceFile) bits.push(`Path: <code>${escapeHtml(item.path)}</code>`);
      if (item.evidence !== undefined && item.evidence !== null && String(item.evidence) !== '') {
        bits.push(`Evidence: <span>${escapeHtml(String(item.evidence))}</span>`);
      }
      return `<li>${bits.join(' — ') || 'Match'}</li>`;
    }).join('');

    return `<section class="finding ${escapeHtml(group.severity)}"><h2><span>${escapeHtml(group.severity)}</span> ${escapeHtml(group.title)}</h2>${isRedundantMessage(group.title, group.message) ? '' : `<p>${escapeHtml(group.message)}</p>`}<ul>${matches}</ul></section>`;
  }).join('');

  const details = view.details.length
    ? `<section class="details"><h2>Inspection details</h2><ul>${view.details.map((item) => `<li><strong>${escapeHtml(item.title)}</strong>${item.message ? ` — ${escapeHtml(item.message)}` : ''}</li>`).join('')}</ul></section>`
    : '';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kalypt report</title><style>
body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;max-width:980px;margin:40px auto;padding:0 24px;color:#1c232b;background:#fff}h1{margin-bottom:4px}.meta{color:#64707d;margin-bottom:24px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.summary div{border:1px solid #d9dee5;border-radius:10px;padding:12px}.summary strong{display:block;font-size:1.5rem}.finding{border:1px solid #d9dee5;border-left:4px solid #8a97a6;border-radius:10px;padding:12px 14px;margin:10px 0}.finding.critical,.finding.high{border-left-color:#d33}.finding.medium{border-left-color:#d29d16}.finding.low{border-left-color:#2d86b7}.finding h2{font-size:1rem;margin:0 0 6px}.finding h2 span{font-size:.7rem;text-transform:uppercase;color:#66717f}.finding p{margin:0 0 8px;color:#495563}.finding ul,.details ul{margin:6px 0 0;padding-left:20px}code{font-size:.9em}.details{margin-top:24px;border-top:1px solid #d9dee5;padding-top:14px}@media(max-width:700px){.summary{grid-template-columns:repeat(2,1fr)}}
</style></head><body><h1>Kalypt report</h1><div class="meta">${escapeHtml(scope)} · ${escapeHtml(state.policy)} policy · ${escapeHtml(new Date().toLocaleString())}</div><div class="summary"><div>Findings<strong>${view.findings.length}</strong></div><div>Critical / High<strong>${dangerCount}</strong></div><div>Removable<strong>${removableCount}</strong></div><div>Items inspected<strong>${view.itemCount}</strong></div></div>${rows || '<p>No findings requiring review.</p>'}${details}</body></html>`;
}

function exportStem(entries) {
  if (state.viewMode === 'file') return `${baseName(entryName(entries[0]))}.kalypt-report`;
  const roots = entries.map((entry) => entry.file.webkitRelativePath?.split('/')[0]).filter(Boolean);
  const commonRoot = roots.length === entries.length && roots.every((root) => root === roots[0]) ? roots[0] : null;
  return `${commonRoot ? baseName(commonRoot) : 'kalypt'}.report`;
}

function entryName(entry) {
  return entry.file.webkitRelativePath || entry.file.name;
}

function download(blob, name) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function baseName(value) {
  return String(value).split(/[\\/]/).pop().replace(/\.[^.]+$/, '') || 'report';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function showFatal(error) {
  document.body.innerHTML = `<pre style="padding:24px">${escapeHtml(error?.stack || error?.message || String(error))}</pre>`;
}
