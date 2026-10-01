const uiState = {
  groupBy: 'type',
  sortBy: 'severity',
  filesExpanded: false,
  records: [],
  cleanableFiles: new Set(),
  enhancing: false
};

const severityRank = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
const findingsRoot = document.getElementById('findings');
const fileTabs = document.getElementById('file-tabs');

init();

function init() {
  setupFileList();

  const findingsObserver = new MutationObserver(() => scheduleEnhance());
  findingsObserver.observe(findingsRoot, { childList: true, subtree: true });

  const fileObserver = new MutationObserver(() => decorateFileTabs());
  fileObserver.observe(fileTabs, { childList: true });

  document.addEventListener('click', (event) => {
    for (const menu of document.querySelectorAll('.findings-view-menu[open]')) {
      if (!menu.contains(event.target)) menu.open = false;
    }
  });

  scheduleEnhance();
}

function setupFileList() {
  if (fileTabs.parentElement?.classList.contains('file-list-area')) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'file-list-area';
  fileTabs.before(wrapper);
  wrapper.append(fileTabs);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'file-list-toggle hidden';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    uiState.filesExpanded = !uiState.filesExpanded;
    syncFileListToggle();
  });
  wrapper.append(toggle);
  syncFileListToggle();
}

function syncFileListToggle() {
  const toggle = document.querySelector('.file-list-toggle');
  if (!toggle) return;
  const count = fileTabs.querySelectorAll('.file-tab').length;
  toggle.classList.toggle('hidden', count <= 2);
  fileTabs.classList.toggle('expanded', uiState.filesExpanded && count > 2);
  toggle.textContent = uiState.filesExpanded ? 'Collapse files' : `Show all ${count} files`;
  toggle.setAttribute('aria-expanded', String(uiState.filesExpanded));
}

function scheduleEnhance() {
  if (uiState.enhancing) return;
  queueMicrotask(enhanceFindings);
}

function enhanceFindings() {
  if (uiState.enhancing) return;
  const header = findingsRoot.querySelector('.findings-header');
  const list = findingsRoot.querySelector('.finding-list');
  if (!header || !list) {
    decorateFileTabs();
    return;
  }

  if (header.querySelector('.findings-view-menu')) {
    decorateFileTabs();
    return;
  }

  uiState.enhancing = true;
  try {
    uiState.records = parseFindingRecords(list);
    rememberCleanableFiles(uiState.records);

    const actions = header.querySelector('.findings-actions');
    if (actions) {
      const exportMenu = actions.querySelector('.export-menu');
      const viewMenu = createViewMenu();
      if (exportMenu) actions.insertBefore(viewMenu, exportMenu);
      else actions.append(viewMenu);
    }

    renderOrganizedFindings(list, header);
    decorateFileTabs();
  } finally {
    uiState.enhancing = false;
  }
}

function parseFindingRecords(list) {
  return [...list.querySelectorAll(':scope > .finding-row')].map((row) => {
    const severity = ['critical', 'high', 'medium', 'low', 'info'].find((value) => row.classList.contains(value)) || 'other';
    const title = row.querySelector('.finding-head h3')?.textContent?.trim() || 'Finding';
    const message = row.querySelector('.finding-message')?.textContent?.trim() || '';
    const removable = Boolean(row.querySelector('.cleanable'));
    const matches = [...row.querySelectorAll('.match-row')].map(parseMatchRow);

    return {
      severity,
      title,
      message,
      removable,
      matches: matches.length ? matches : [{ file: '', evidence: '', path: '' }]
    };
  });
}

function parseMatchRow(row) {
  const match = { file: '', evidence: '', path: '' };
  for (const span of row.querySelectorAll(':scope > span')) {
    const text = span.textContent.trim();
    const value = span.querySelector('code')?.textContent?.trim() || '';
    if (text.startsWith('File:')) match.file = value;
    else if (text.startsWith('Evidence:')) match.evidence = value;
    else if (text.startsWith('Path:')) match.path = value;
  }
  return match;
}

function rememberCleanableFiles(records) {
  for (const record of records) {
    if (!record.removable) continue;
    for (const match of record.matches) {
      if (match.file) uiState.cleanableFiles.add(match.file);
    }
  }
}

function decorateFileTabs() {
  syncFileListToggle();

  for (const button of fileTabs.querySelectorAll('.file-tab')) {
    const rawName = button.title || button.textContent || '';
    const name = rawName.replace(/^(Scanning|Error) · /, '');

    if (!button.querySelector('.file-tab-name')) {
      button.replaceChildren();
      const label = document.createElement('span');
      label.className = 'file-tab-name';
      label.textContent = rawName;
      button.append(label);
    }

    button.querySelector('.file-tab-cleanable')?.remove();
    if (uiState.cleanableFiles.has(name)) {
      const badge = document.createElement('span');
      badge.className = 'file-tab-cleanable';
      badge.textContent = 'Cleanable';
      button.append(badge);
    }
  }
}

function createViewMenu() {
  const menu = document.createElement('details');
  menu.className = 'findings-view-menu';
  const byFile = document.getElementById('view-file')?.classList.contains('active');
  if (byFile && uiState.groupBy === 'file') uiState.groupBy = 'type';
  if (byFile && uiState.sortBy === 'file') uiState.sortBy = 'severity';

  menu.innerHTML = `
    <summary>View</summary>
    <div class="findings-view-options">
      <label>Group by
        <select data-group-by>
          <option value="type">Finding type</option>
          <option value="severity">Severity</option>
          <option value="file" ${byFile ? 'disabled' : ''}>File</option>
          <option value="none">None</option>
        </select>
      </label>
      <label>Sort by
        <select data-sort-by>
          <option value="severity">Severity</option>
          <option value="name">Name</option>
          <option value="file" ${byFile ? 'disabled' : ''}>File</option>
          <option value="matches">Match count</option>
        </select>
      </label>
    </div>`;

  const groupSelect = menu.querySelector('[data-group-by]');
  const sortSelect = menu.querySelector('[data-sort-by]');
  groupSelect.value = uiState.groupBy;
  sortSelect.value = uiState.sortBy;

  groupSelect.addEventListener('change', () => {
    uiState.groupBy = groupSelect.value;
    rerenderCurrentList();
  });
  sortSelect.addEventListener('change', () => {
    uiState.sortBy = sortSelect.value;
    rerenderCurrentList();
  });
  return menu;
}

function rerenderCurrentList() {
  const header = findingsRoot.querySelector('.findings-header');
  const list = findingsRoot.querySelector('.finding-list');
  if (!header || !list) return;
  uiState.enhancing = true;
  try {
    renderOrganizedFindings(list, header);
  } finally {
    uiState.enhancing = false;
  }
}

function renderOrganizedFindings(list, header) {
  list.replaceChildren();
  const sections = organizeRecords(uiState.records);

  for (const section of sections) {
    if (section.label) {
      const sectionHeader = document.createElement('div');
      sectionHeader.className = 'finding-section-label';
      sectionHeader.innerHTML = `<strong>${escapeHtml(section.label)}</strong><span>${section.records.length} ${section.records.length === 1 ? 'finding' : 'findings'}</span>`;
      list.append(sectionHeader);
    }
    for (const record of section.records) list.append(renderRecord(record));
  }

  wireExpandAll(header, list);
}

function organizeRecords(records) {
  const byFile = document.getElementById('view-file')?.classList.contains('active');
  const groupBy = byFile && uiState.groupBy === 'file' ? 'type' : uiState.groupBy;
  const sortBy = byFile && uiState.sortBy === 'file' ? 'severity' : uiState.sortBy;

  if (groupBy === 'severity') {
    const buckets = new Map();
    for (const record of records) {
      if (!buckets.has(record.severity)) buckets.set(record.severity, []);
      buckets.get(record.severity).push(record);
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => (severityRank[a] ?? 99) - (severityRank[b] ?? 99))
      .map(([label, items]) => ({ label: label.toUpperCase(), records: sortRecords(items, sortBy) }));
  }

  if (groupBy === 'file') {
    const buckets = new Map();
    for (const record of records) {
      const groupedMatches = new Map();
      for (const match of record.matches) {
        const file = match.file || 'Unattributed';
        if (!groupedMatches.has(file)) groupedMatches.set(file, []);
        groupedMatches.get(file).push(match);
      }
      for (const [file, matches] of groupedMatches) {
        if (!buckets.has(file)) buckets.set(file, []);
        buckets.get(file).push({ ...record, matches });
      }
    }
    return [...buckets.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, items]) => ({ label, records: sortRecords(items, sortBy) }));
  }

  if (groupBy === 'none') {
    const expanded = records.flatMap((record) => record.matches.map((match) => ({ ...record, matches: [match] })));
    return [{ label: '', records: sortRecords(expanded, sortBy) }];
  }

  return [{ label: '', records: sortRecords(records, sortBy) }];
}

function sortRecords(records, mode) {
  return [...records].sort((a, b) => {
    if (mode === 'matches') {
      const diff = b.matches.length - a.matches.length;
      if (diff) return diff;
    }
    if (mode === 'name') return a.title.localeCompare(b.title);
    if (mode === 'file') {
      const diff = firstFile(a).localeCompare(firstFile(b));
      if (diff) return diff;
    }
    const severityDiff = (severityRank[a.severity] ?? 99) - (severityRank[b.severity] ?? 99);
    if (severityDiff) return severityDiff;
    return a.title.localeCompare(b.title);
  });
}

function firstFile(record) {
  return record.matches.find((match) => match.file)?.file || '';
}

function renderRecord(record) {
  const row = document.createElement('article');
  row.className = `finding-row ${record.severity}`;
  const count = record.matches.length;
  row.innerHTML = `
    <div class="finding-main">
      <div class="finding-head">
        <span class="pill">${escapeHtml(record.severity)}</span>
        <h3>${escapeHtml(record.title)}</h3>
        ${record.removable ? '<span class="cleanable">Removable</span>' : ''}
      </div>
      ${record.message ? `<p class="finding-message">${escapeHtml(record.message)}</p>` : ''}
      ${renderMatches(record.matches)}
    </div>
    <span class="finding-count">${count} ${count === 1 ? 'match' : 'matches'}</span>`;
  return row;
}

function renderMatches(matches) {
  if (!matches.length) return '';
  const first = renderMatch(matches[0]);
  if (matches.length === 1) return `<div class="match-preview">${first}</div>`;
  const remaining = matches.slice(1).map(renderMatch).join('');
  return `
    <div class="match-preview">${first}</div>
    <details class="more-details">
      <summary>Show ${matches.length - 1} more</summary>
      <div class="more-list">${remaining}</div>
    </details>`;
}

function renderMatch(match) {
  const parts = [];
  if (match.file) parts.push(`<span>File: <code>${escapeHtml(match.file)}</code></span>`);
  if (match.evidence) parts.push(`<span>Evidence: <code>${escapeHtml(match.evidence)}</code></span>`);
  if (match.path) parts.push(`<span>Path: <code>${escapeHtml(match.path)}</code></span>`);
  return `<div class="match-row">${parts.join('')}</div>`;
}

function wireExpandAll(header, list) {
  const existing = header.querySelector('.findings-toggle');
  const expanders = [...list.querySelectorAll('details.more-details')];

  if (!expanders.length) {
    existing?.remove();
    return;
  }

  const button = existing ? existing.cloneNode(true) : document.createElement('button');
  if (!existing) {
    button.type = 'button';
    button.className = 'secondary compact findings-toggle';
    const actions = header.querySelector('.findings-actions');
    const viewMenu = actions.querySelector('.findings-view-menu');
    actions.insertBefore(button, viewMenu || null);
  } else {
    existing.replaceWith(button);
  }

  const sync = () => {
    button.textContent = expanders.every((details) => details.open) ? 'Collapse all' : 'Expand all';
  };
  button.addEventListener('click', () => {
    const open = !expanders.every((details) => details.open);
    for (const details of expanders) details.open = open;
    sync();
  });
  for (const details of expanders) details.addEventListener('toggle', sync);
  sync();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
