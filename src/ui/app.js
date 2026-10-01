const state = { entries: [], selected: 0, policy: 'public' };
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
  $('choose-files').addEventListener('click', () => fileInput.click());
  $('choose-folder').addEventListener('click', () => folderInput.click());
  fileInput.addEventListener('change', () => inspectFiles([...fileInput.files]));
  folderInput.addEventListener('change', () => inspectFiles([...folderInput.files]));
  dropzone.addEventListener('click', (event) => {
    if (event.target === dropzone || event.target.closest('.drop-icon')) fileInput.click();
  });
  dropzone.addEventListener('keydown', (event) => {
    if (event.target === dropzone && (event.key === 'Enter' || event.key === ' ')) fileInput.click();
  });
  for (const event of ['dragenter', 'dragover']) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
  for (const event of ['dragleave', 'drop']) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', (event) => inspectFiles([...event.dataTransfer.files]));
  $('clean-button').addEventListener('click', cleanSelected);
  $('export-button').addEventListener('click', exportSelected);

  const privacy = $('privacy-details');
  document.addEventListener('click', (event) => {
    if (privacy?.open && !privacy.contains(event.target)) privacy.open = false;
  });
}

async function inspectFiles(files) {
  if (!files.length) return;
  state.entries = files.map((file) => ({ file, report: null, error: null, status: 'queued' }));
  state.selected = 0;
  $('queue').classList.remove('hidden');
  $('result').classList.add('hidden');
  renderTabs();
  for (let i = 0; i < state.entries.length; i += 1) {
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
  $('total-count').textContent = report.summary.total;
  $('danger-count').textContent = report.summary.counts.critical + report.summary.counts.high;
  $('removable-count').textContent = report.summary.removable;
  $('item-count').textContent = report.items.length;
  $('clean-button').disabled = !report.findings.some((f) => f.removable);
  $('clean-note').textContent = $('clean-button').disabled ? 'No safe built-in cleaner is available for the current findings.' : 'Cleaning creates a new copy; the original stays untouched.';

  const root = $('findings');
  root.replaceChildren();
  if (!report.findings.length) {
    root.innerHTML = '<div class="empty">No findings under this policy.</div>';
    return;
  }

  const header = document.createElement('div');
  header.className = 'findings-header';
  header.innerHTML = `<h2>Findings</h2><span>${report.summary.total} total</span>`;
  root.append(header);

  const list = document.createElement('div');
  list.className = 'finding-list';
  for (const group of groupFindings(report.findings)) list.append(renderFindingGroup(group));
  root.append(list);
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
  return [...groups.values()];
}

function renderFindingGroup(group) {
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
      </div>
      ${showMessage ? `<p class="finding-message">${escapeHtml(group.message)}</p>` : ''}
      <div class="finding-meta"><code>${escapeHtml(group.category)}</code>${clean}</div>
      ${renderMatchPreview(group.matches)}
    </div>
    <span class="finding-count">${count} ${count === 1 ? 'match' : 'matches'}</span>`;
  return row;
}

function renderMatchPreview(matches) {
  const previewCount = Math.min(3, matches.length);
  const preview = matches.slice(0, previewCount).map(renderMatchRow).join('');
  if (matches.length <= previewCount) return `<div class="match-preview">${preview}</div>`;
  const remaining = matches.slice(previewCount).map(renderMatchRow).join('');
  return `
    <div class="match-preview">${preview}</div>
    <details class="more-details">
      <summary>+${matches.length - previewCount} more</summary>
      <div class="more-list">${remaining}</div>
    </details>`;
}

function renderMatchRow(item) {
  const path = item.path ? `<span>Path: <code>${escapeHtml(item.path)}</code></span>` : '<span></span>';
  const evidence = item.evidence !== undefined && item.evidence !== null && String(item.evidence) !== ''
    ? `<span>Evidence: <code>${escapeHtml(String(item.evidence))}</code></span>`
    : '<span></span>';
  return `<div class="match-row">${evidence}${path}</div>`;
}

function isRedundantMessage(title, message) {
  const text = String(message || '').trim();
  if (!text) return true;
  const normalized = text.toLowerCase();
  const redundantPatterns = [
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
  a.href = href; a.download = name; a.click();
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
