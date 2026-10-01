import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { finding, Severity } from '../model.js';

export function isGitRepository(target) {
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) return false;
  const result = git(target, ['rev-parse', '--is-inside-work-tree']);
  return result.ok && result.stdout.trim() === 'true';
}

export function inspectGitRepository(root) {
  const findings = [];
  const remotes = git(root, ['remote', '-v']);
  if (remotes.ok && remotes.stdout.trim()) findings.push(finding({
    severity: Severity.INFO,
    category: 'git.remotes',
    title: 'Git remotes configured',
    message: 'Repository remote URLs can reveal hosting organization, usernames, or internal hostnames.',
    source: root,
    evidence: redactRemoteOutput(remotes.stdout).slice(0, 500),
    tags: ['git', 'metadata']
  }));

  const authors = git(root, ['log', '--all', '--format=%an%x09%ae', '--max-count=5000']);
  if (authors.ok) {
    const identities = unique(authors.stdout.split(/\r?\n/).filter(Boolean)).slice(0, 100);
    for (const row of identities) {
      const [name, email] = row.split('\t');
      if (!email) continue;
      findings.push(finding({
        severity: Severity.MEDIUM,
        category: 'git.author-identity',
        title: 'Git author identity in history',
        message: 'Commit history contains a contributor name and email address.',
        source: root,
        evidence: `${name || '(unnamed)'} <${email}>`,
        removable: false,
        tags: ['git', 'identity', 'history']
      }));
    }
  }

  const trackedSensitive = git(root, ['ls-files']);
  if (trackedSensitive.ok) {
    const names = trackedSensitive.stdout.split(/\r?\n/).filter(Boolean);
    for (const name of names.filter(isSensitiveName).slice(0, 50)) findings.push(finding({
      severity: Severity.HIGH,
      category: 'git.sensitive-file-tracked',
      title: 'Sensitive-looking file is tracked',
      message: 'Git currently tracks a filename commonly associated with local credentials or secrets.',
      source: root,
      path: name,
      evidence: name,
      tags: ['git', 'secret']
    }));
  }

  for (const name of ['.env', '.env.local', '.npmrc', '.pypirc']) {
    const full = path.join(root, name);
    if (!fs.existsSync(full)) continue;
    const ignored = git(root, ['check-ignore', '-q', '--', name]);
    if (ignored.status === 0) findings.push(finding({
      severity: Severity.INFO,
      category: 'git.local-sensitive-file-ignored',
      title: `${name} is present but ignored`,
      message: 'A sensitive-looking local file exists and Git ignore rules currently exclude it.',
      source: root,
      path: name,
      tags: ['git', 'secret', 'ignore']
    }));
    else findings.push(finding({
      severity: Severity.HIGH,
      category: 'git.local-sensitive-file-unignored',
      title: `${name} is present and not ignored`,
      message: 'A sensitive-looking local file exists and is not excluded by Git ignore rules.',
      source: root,
      path: name,
      tags: ['git', 'secret', 'ignore']
    }));
  }

  const status = git(root, ['status', '--porcelain=v1']);
  if (status.ok && status.stdout.trim()) findings.push(finding({
    severity: Severity.INFO,
    category: 'git.dirty',
    title: 'Repository has uncommitted changes',
    message: 'The repository contains modified, staged, or untracked work that may differ from the version you expect to share.',
    source: root,
    evidence: `${status.stdout.trim().split(/\r?\n/).length} changed path(s)`,
    tags: ['git', 'state']
  }));

  return findings;
}

function git(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  return { ok: !result.error && result.status === 0, status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function isSensitiveName(value) {
  const base = value.toLowerCase();
  return /(^|\/)(\.env(?:\.|$)|id_rsa$|id_ed25519$|credentials(?:\.|$)|secrets?(?:\.|$)|\.npmrc$|\.pypirc$)/.test(base);
}

function unique(values) {
  return [...new Set(values)];
}

function redactRemoteOutput(value) {
  return value.replace(/(https?:\/\/)([^/@\s]+)@/g, '$1***@');
}

export function listGitTrackedFiles(root) {
  const result = spawnSync('git', ['-C', root, 'ls-files', '-z'], { encoding: null, windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) return [];
  return result.stdout.toString('utf8').split('\0').filter(Boolean).map((name) => path.resolve(root, name));
}

export function inspectGitHistorySecrets(root, { maxBlobs = 1500, maxBlobBytes = 1024 * 1024 } = {}) {
  const objects = git(root, ['rev-list', '--objects', '--all']);
  if (!objects.ok) return [];
  const objectRows = objects.stdout.split(/\r?\n/).filter(Boolean);
  const hashToPath = new Map();
  const hashes = [];
  for (const row of objectRows) {
    const space = row.indexOf(' ');
    const hash = space === -1 ? row : row.slice(0, space);
    const objectPath = space === -1 ? '' : row.slice(space + 1);
    if (/^[0-9a-f]{40,64}$/i.test(hash)) {
      hashes.push(hash);
      if (objectPath) hashToPath.set(hash, objectPath);
    }
  }
  if (!hashes.length) return [];

  const checked = spawnSync('git', ['-C', root, 'cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)'], {
    input: `${hashes.join('\n')}\n`,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024
  });
  if (checked.error || checked.status !== 0) return [];

  const candidates = [];
  for (const line of checked.stdout.split(/\r?\n/)) {
    const match = line.match(/^([0-9a-f]+) blob (\d+)$/i);
    if (!match) continue;
    const size = Number(match[2]);
    if (size <= maxBlobBytes) candidates.push({ hash: match[1], size });
    if (candidates.length >= maxBlobs) break;
  }
  if (!candidates.length) return [];

  const batch = spawnSync('git', ['-C', root, 'cat-file', '--batch'], {
    input: Buffer.from(`${candidates.map((item) => item.hash).join('\n')}\n`),
    encoding: null,
    windowsHide: true,
    maxBuffer: Math.min(512 * 1024 * 1024, candidates.reduce((sum, item) => sum + item.size + 128, 0) + 1024)
  });
  if (batch.error || batch.status !== 0 || !batch.stdout) return [];

  const findings = [];
  let offset = 0;
  while (offset < batch.stdout.length && findings.length < 100) {
    const newline = batch.stdout.indexOf(0x0a, offset);
    if (newline === -1) break;
    const header = batch.stdout.subarray(offset, newline).toString('utf8');
    const match = header.match(/^([0-9a-f]+) blob (\d+)$/i);
    if (!match) break;
    const hash = match[1];
    const size = Number(match[2]);
    const start = newline + 1;
    const end = start + size;
    if (end > batch.stdout.length) break;
    const blob = batch.stdout.subarray(start, end);
    offset = end + 1;
    if (blob.includes(0)) continue;
    const text = blob.toString('utf8');
    const secretFindings = inspectSecretsFromHistory(text, root, hashToPath.get(hash) || `(blob ${hash.slice(0, 12)})`, hash);
    findings.push(...secretFindings);
  }
  return dedupeGitFindings(findings).slice(0, 100);
}

function inspectSecretsFromHistory(text, root, objectPath, hash) {
  const patterns = [
    ['AWS access key candidate', 'secret.aws-access-key', /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g],
    ['GitHub token candidate', 'secret.github-token', /\bgh[pousr]_[A-Za-z0-9_]{20,255}\b/g],
    ['Private key material', 'secret.private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['Slack token candidate', 'secret.slack-token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
    ['Hard-coded secret candidate', 'secret.generic-secret', /\b(?:api[_-]?key|secret|token|password|passwd)\s*[:=]\s*["']?([A-Za-z0-9_\-\/.+=]{12,})["']?/gi]
  ];
  const out = [];
  for (const [title, category, regex] of patterns) {
    regex.lastIndex = 0;
    const match = regex.exec(text);
    if (!match) continue;
    const value = match[1] ?? match[0];
    out.push(finding({
      severity: Severity.CRITICAL,
      category: `git.history.${category}`,
      title: `${title} in Git history`,
      message: 'A historical Git blob contains potential secret material. Deleting the current file does not remove this from repository history.',
      source: root,
      path: objectPath,
      evidence: `${redactHistory(value)} @ ${hash.slice(0, 12)}`,
      removable: false,
      confidence: category === 'secret.generic-secret' ? 0.7 : 0.95,
      tags: ['git', 'history', 'secret']
    }));
  }
  return out;
}

function redactHistory(value) {
  const text = String(value);
  if (text.length <= 8) return '••••';
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function dedupeGitFindings(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.category}:${item.path}:${item.evidence?.replace(/ @ [0-9a-f]+$/i, '') ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
