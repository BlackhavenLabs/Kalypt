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
  dropzone.addEventListener('click', (event) => { if (event.target === dropzone || event.target.closest('.drop-icon')) fileInput.click(); });
  dropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') fileInput.click(); });
  for (const event of ['dragenter', 'dragover']) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.add('drag'); });
  for (const event of ['dragleave', 'drop']) dropzone.addEventListener(event, (e) => { e.preventDefault(); dropzone.classList.remove('drag'); });
  dropzone.addEventListener('drop', (event) => inspectFiles([...event.dataTransfer.files]));
  $('clean-button').addEventListener('click', cleanSelected);
  $('export-button').addEventListener('click', exportSelected);
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
    $('findings').innerHTML = `<div class="finding high"><h3>Could not inspect this file</h3><p>${escapeHtml(entry.error)}</p></div>`;
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
  for (const item of report.findings) root.append(renderFinding(item));
}

function renderFinding(item) {
  const article = document.createElement('article');
  article.className = `finding ${item.severity}`;
  const clean = item.removable ? '<span class="cleanable">Removable</span>' : '';
  article.innerHTML = `
    <div class="finding-head"><span class="pill">${escapeHtml(item.severity)}</span><h3>${escapeHtml(item.title)}</h3></div>
    <p>${escapeHtml(item.message)}</p>
    <div class="meta">
      <span><code>${escapeHtml(item.category)}</code> ${clean}</span>
      ${item.path ? `<span>Path: <code>${escapeHtml(item.path)}</code></span>` : ''}
      ${item.evidence ? `<span>Evidence: <code>${escapeHtml(String(item.evidence))}</code></span>` : ''}
    </div>`;
  return article;
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
