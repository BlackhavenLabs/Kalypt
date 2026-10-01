const state = { entries: [], selected: 0, policy: 'public', appendNext: false };
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
  $('policy').addEventListener('change', () => { state.policy = $('policy').value; rescanAll(); });

  $('choose-files').addEventListener('click', () => openPicker(fileInput, false));
  $('choose-folder').addEventListener('click', () => openPicker(folderInput, false));
  $('add-files').addEventListener('click', () => openPicker(fileInput, true));
  $('add-folder').addEventListener('click', () => openPicker(folderInput, true));
  fileInput.addEventListener('change', () => consumePicker(fileInput));
  folderInput.addEventListener('change', () => consumePicker(folderInput));

  dropzone.addEventListener('click', (event) => {
    if (event.target === dropzone) openPicker(fileInput, false);
  });
  dropzone.addEventListener('keydown', (event) => {
    if (event.target === dropzone && (event.key === 'Enter' || event.key === ' ')) openPicker(fileInput, false);
  });
  for (const event of ['dragenter', 'dragover']) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
  for (const event of ['dragleave', 'drop']) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', (event) => inspectFiles([...event.dataTransfer.files], { append: state.entries.length > 0 }));

  $('clean-button').addEventListener('click', cleanSelected);
  $('export-button').addEventListener('click', exportSelected);

  const privacy = $('privacy-details');
  document.addEventListener('click', (event) => {
    if (privacy?.open && !privacy.contains(event.target)) privacy.open = false;
  });
}

function openPicker(input, append) {
  state.appendNext = append;
  input.click();
}

function consumePicker(input) {
  const files = [...input.files];
  const append = state.appendNext;
  state.appendNext = false;
  input.value = '';
  inspectFiles(files, { append });
}

async function inspectFiles(files, { append = false } = {}) {
  if (!files.length) return;

  const newEntries = files.map((file) => ({ file, report: null, error: null, status: 'queued' }));
  const startIndex = append ? state.entries.length : 0;

  if (append) state.entries.push(...newEntries);
  else state.entries = newEntries;

  state.selected = startIndex;
  $('queue').classList.remove('hidden');
  if (!append) $('result').classList.add('hidden');
  renderTabs();

  for (let i = startIndex; i < state.entries.length; i += 1) {
    await inspectOne(i);
    renderTabs();
    if (i === state.selected) renderSelected();
  }
}

async function inspectOne(index) {
  const entry = state.entries[index];
  entry.status = 'scanning';
  renderTabs();
  try {
    const logicalName = entry.file.webkitRelativePath || entry.file.name;
    const response = await fetch(`/api/scan?name=${encodeURIComponent(logicalName)}&policy=${encodeURIComponent(state.policy)}`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: entry.file
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
  renderTabs();
  renderSelected();
}

function renderTabs() {
  const tabs = $('file-tabs');
  tabs.replaceChildren();
  const done = state.entries.filter((entry) => entry.status === 'done').length;
  $('queue-status').textContent = `${done}/${state.entries.length} inspected`;
  state.entries.forEach((entry, index) => {
    const button = document.createElement('button');
    button.className = `file-tab${index === state.selected ? ' active' : ''}${entry.error ? ' error' : ''}`;
    const prefix = entry.status === 'scanning' ? 'Scanning · ' : entry.error ? 'Error · ' : '';
    button.textContent = `${prefix}${entry.file.webkitRelativePath || entry.file.name}`;
    button.title = button.textContent;
    button.addEventListener('click', () => { state.selected = index; renderTabs(); renderSelected(); });
    tabs.append(button);
  });
}

function renderSelected() {
  const entry = state.entries[state.selected];
  if (!entry) return;
  $('result').classList.remove('hidden');

  if (entry.error) {
    $('findings').innerHTML = `<div class="finding-row high"><div class="finding-main"><h3>Could not inspect this file</h3><p class="finding-message">${escapeHtml(entry.error)}</p></div></div>`;
    for (const id of ['total-count', 'danger-count', 'removable-count', 'item-count']) $(id).textContent = '—';
    $('clean-button').disabled = true;
    return;
  }
  if (!entry.report) {
    $('findings').innerHTML = '<div class="empty">Scanning…</div>';
    return;
  }

  const report = entry.report;
  const currentPath = entry.file.webkitRelativePath || entry.file.name;
  const findings = report.findings.filter((item) => item.severity !== 'info');
  const details = report.findings.filter((item) => item.severity === 'info');
  const dangerCount = findings.filter((item) => item.severity === 'critical' || item.severity === 'high').length;
  const removableCount = findings.filter((item) => item.removable).length;

  $('total-count').textContent = findings.length;
  $('danger-count').textContent = dangerCount;
  $('removable-count').textContent = removableCount;
  $('item-count').textContent = report.items.length;

  const cleanButton = $('clean-button');
  cleanButton.disabled = removableCount === 0;
  cleanButton.classList.toggle('hidden', removableCount === 0);
  $('clean-note').textContent = removableCount > 0
    ? 'Cleaning creates a new copy; the original stays untouched.'
    : findings.length > 0
      ? 'No safe built-in cleaner is available for the current findings.'
      : '';

  const root = $('findings');
  root.replaceChildren();

  if (findings.length) {
    const header = document.createElement('div');
    header.className = 'findings-header';
    header.innerHTML = `<h2>Findings</h2><span>${findings.length} total</span>`;
    root.append(header);

    const list = document.createElement('div');
    list.className = 'finding-list';
    for (const group of groupFindings(findings)) list.append(renderFindingGroup(group, currentPath));
    root.append(list);
  } else {
    const clear = document.createElement('div');
    clear.className = 'clear-state';
    clear.innerHTML = '<strong>No findings</strong><span>Nothing requiring review under this policy.</span>';
    root.append(clear);
  }

  if (details.length) root.append(renderInspectionDetails(details));
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
  if (item.evidence !== undefined && item.evidence !== null && String(item.evidence) !== '') {
    parts.push(`<span>Evidence: <code>${escapeHtml(String(item.evidence))}</code></span>`);
  }
  if (item.path && item.path !== currentPath) {
    parts.push(`<span>Path: <code>${escapeHtml(item.path)}</code></span>`);
  }
  return parts.length ? `<div class="match-row">${parts.join('')}</div>` : '';
}

function renderInspectionDetails(details) {
  const groups = groupFindings(details);
  const wrapper = document.createElement('details');
  wrapper.className = 'inspection-details';
  wrapper.innerHTML = `<summary>Inspection details <span>${details.length}</span></summary>`;

  const list = document.createElement('div');
  list.className = 'inspection-detail-list';
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
  if (!entry?.file) return;
  $('clean-button').disabled = true;
  $('clean-note').textContent = 'Creating and verifying clean copy…';
  try {
    const response = await fetch(`/api/clean?name=${encodeURIComponent(entry.file.name)}&policy=${encodeURIComponent(state.policy)}`, {
      method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: entry.file
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
    $('clean-note').textContent = findingsAfter === null ? `Created ${name}.` : `Created ${name}. Verification found ${findingsAfter} remaining finding(s) under the ${state.policy} policy.`;
  } catch (error) {
    $('clean-note').textContent = error.message;
  } finally {
    $('clean-button').disabled = false;
  }
}

function exportSelected() {
  const report = state.entries[state.selected]?.report;
  if (!report) return;
  download(new Blob([`${JSON.stringify(report, null, 2)}\n`], { type: 'application/json' }), `${baseName(report.target)}.kalypt.json`);
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
