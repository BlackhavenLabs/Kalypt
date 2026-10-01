import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { detectType } from './detect.js';
import { inspectImage } from './inspectors/image.js';
import { inspectPdf } from './inspectors/pdf.js';
import { inspectOffice } from './inspectors/office.js';
import { inspectZip } from './inspectors/archive.js';
import { inspectGeneric } from './inspectors/generic.js';
import { inspectMedia } from './inspectors/media.js';
import {
  inspectGitRepository,
  inspectGitHistorySecrets,
  isGitRepository,
  listGitTrackedFiles
} from './inspectors/git.js';
import { readZip } from './formats/zip.js';
import { summarizeFindings, finding, Severity } from './model.js';
import { runPlugins } from './plugins.js';
import { applyPortableFingerprints } from './fingerprint.js';

const DEFAULTS = {
  maxFileBytes: 64 * 1024 * 1024,
  maxFiles: 10000,
  maxArchiveDepth: 3,
  maxArchiveEntriesToScan: 500,
  scanBinaryStrings: false,
  gitTrackedOnly: false,
  gitHistory: true,
  gitHistoryLimits: { maxBlobs: 1500, maxBlobBytes: 1024 * 1024 },
  ignore: ['.git', 'node_modules', '.kalypt', 'dist', 'coverage', '.next', '.cache'],
  zipSafety: { maxEntries: 10000, maxInflatedBytes: 512 * 1024 * 1024 },
  plugins: []
};

export async function scanTarget(target, options = {}) {
  const config = mergeOptions(options);
  const absolute = path.resolve(target);
  const lst = await fs.lstat(absolute);
  const startedAt = new Date().toISOString();
  const findings = [];
  const items = [];

  if (lst.isSymbolicLink()) {
    findings.push(finding({
      severity: Severity.MEDIUM,
      category: 'filesystem.symlink',
      title: 'Symbolic link target',
      message: 'The selected target is a symbolic link; verify the resolved path before sharing or cleaning it.',
      source: absolute,
      evidence: await fs.readlink(absolute),
      tags: ['filesystem', 'link']
    }));
  }

  const stat = await fs.stat(absolute);
  if (stat.isDirectory()) {
    const gitRepo = isGitRepository(absolute);
    if (gitRepo) {
      findings.push(...inspectGitRepository(absolute));
      if (config.gitHistory) findings.push(...inspectGitHistorySecrets(absolute, config.gitHistoryLimits));
    }

    let files;
    if (gitRepo && config.gitTrackedOnly) {
      files = listGitTrackedFiles(absolute);
      findings.push(finding({
        severity: Severity.INFO,
        category: 'scan.git-tracked-only',
        title: 'Scanning Git-tracked files only',
        message: `The file walk is limited to ${files.length} path${files.length === 1 ? '' : 's'} currently tracked by Git.`,
        source: absolute,
        tags: ['scan', 'git']
      }));
    } else {
      const walked = await walkFiles(absolute, config);
      files = walked.files;
      findings.push(...walked.findings);
    }

    for (const file of files.slice(0, config.maxFiles)) {
      try {
        const fileLstat = await fs.lstat(file);
        if (fileLstat.isSymbolicLink()) {
          findings.push(finding({
            severity: Severity.MEDIUM,
            category: 'filesystem.symlink',
            title: 'Git-tracked symbolic link',
            message: 'A tracked path is a symbolic link. Kalypt will not follow it while scanning a share boundary.',
            source: file,
            evidence: await fs.readlink(file),
            tags: ['filesystem', 'link', 'git', 'boundary']
          }));
          continue;
        }
        if (!fileLstat.isFile()) continue;
        const result = await scanFile(file, config, { root: absolute, archiveDepth: 0 });
        findings.push(...result.findings);
        items.push(result.item, ...result.nestedItems);
      } catch (error) {
        findings.push(finding({
          severity: Severity.INFO,
          category: 'scan.unreadable',
          title: 'Could not inspect path',
          message: error.message,
          source: file,
          tags: ['scan', 'filesystem']
        }));
      }
    }
  } else if (stat.isFile()) {
    const result = await scanFile(absolute, config, { root: path.dirname(absolute), archiveDepth: 0 });
    findings.push(...result.findings);
    items.push(result.item, ...result.nestedItems);
  } else {
    throw new Error('Target must resolve to a regular file or directory');
  }

  const uniqueFindings = applyPortableFingerprints(dedupe(findings), absolute, { targetIsDirectory: stat.isDirectory() });
  return {
    schemaVersion: 1,
    tool: { name: 'kalypt', version: '0.3.0' },
    target: absolute,
    startedAt,
    completedAt: new Date().toISOString(),
    summary: summarizeFindings(uniqueFindings),
    findings: sortFindings(uniqueFindings),
    items
  };
}

async function scanFile(file, config, context) {
  const stat = await fs.stat(file);
  const rel = path.relative(context.root, file) || path.basename(file);
  const nestedItems = [];
  if (stat.size > config.maxFileBytes) {
    return {
      item: { source: file, relativePath: rel, size: stat.size, skipped: true, reason: 'size-limit' },
      findings: [finding({
        severity: Severity.INFO,
        category: 'scan.skipped-large-file',
        title: 'Large file not deeply inspected',
        message: `File exceeds the ${formatBytes(config.maxFileBytes)} deep-inspection limit.`,
        source: file,
        evidence: formatBytes(stat.size),
        tags: ['scan', 'limit']
      })],
      nestedItems
    };
  }

  const buffer = await fs.readFile(file);
  const type = detectType(buffer, file);
  const findings = inspectBuffer(buffer, type, file, config);
  findings.push(...runPlugins(buffer, { source: file, name: path.basename(file), type }, config.plugins));
  const item = {
    source: file,
    relativePath: rel,
    size: stat.size,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    kind: type.kind,
    mime: type.mime
  };

  if (type.kind === 'zip' && context.archiveDepth < config.maxArchiveDepth) {
    const nested = scanArchiveEntries(buffer, file, rel, context.archiveDepth + 1, config);
    findings.push(...nested.findings);
    nestedItems.push(...nested.items);
  }

  return { item, findings, nestedItems };
}

function scanArchiveEntries(buffer, outerSource, outerRelative, depth, config) {
  const findings = [];
  const items = [];
  if (depth > config.maxArchiveDepth) return { findings, items };
  try {
    const entries = readZip(buffer, config.zipSafety).slice(0, config.maxArchiveEntriesToScan);
    for (const entry of entries) {
      if (entry.name.endsWith('/')) continue;
      if (entry.data.length > config.maxFileBytes) {
        findings.push(finding({
          severity: Severity.INFO,
          category: 'scan.skipped-large-archive-entry',
          title: 'Large archive entry not deeply inspected',
          message: `Archive member exceeds the ${formatBytes(config.maxFileBytes)} deep-inspection limit.`,
          source: `${outerSource}!${entry.name}`,
          evidence: formatBytes(entry.data.length),
          tags: ['scan', 'archive', 'limit']
        }));
        continue;
      }
      const nestedType = detectType(entry.data, entry.name);
      const nestedSource = `${outerSource}!${entry.name}`;
      const nestedRelative = `${outerRelative}!${entry.name}`;
      findings.push(...inspectBuffer(entry.data, nestedType, nestedSource, config));
      findings.push(...runPlugins(entry.data, { source: nestedSource, name: entry.name, type: nestedType, archiveDepth: depth }, config.plugins));
      items.push({
        source: nestedSource,
        relativePath: nestedRelative,
        size: entry.data.length,
        kind: nestedType.kind,
        mime: nestedType.mime,
        archiveDepth: depth
      });
      if (nestedType.kind === 'zip' && depth < config.maxArchiveDepth) {
        const deeper = scanArchiveEntries(entry.data, nestedSource, nestedRelative, depth + 1, config);
        findings.push(...deeper.findings);
        items.push(...deeper.items);
      }
    }
  } catch {
    // inspectZip already describes malformed/unsupported archives at the relevant level.
  }
  return { findings, items };
}

export function inspectBuffer(buffer, type, source, config = DEFAULTS) {
  switch (type.kind) {
    case 'jpeg':
    case 'png':
      return inspectImage(buffer, type.kind, source);
    case 'pdf':
      return inspectPdf(buffer, source);
    case 'docx':
    case 'xlsx':
    case 'pptx':
      return inspectOffice(buffer, type.kind, source, config);
    case 'zip':
      return inspectZip(buffer, source, config);
    case 'mp3':
    case 'wav':
    case 'mp4':
      return inspectMedia(buffer, type.kind, source);
    default:
      return inspectGeneric(buffer, type, source, config);
  }
}

async function walkFiles(root, config) {
  const files = [];
  const findings = [];
  async function visit(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= config.maxFiles) return;
      if (config.ignore.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) {
        let target = '(unreadable)';
        try { target = await fs.readlink(full); } catch { /* ignore */ }
        findings.push(finding({
          severity: Severity.MEDIUM,
          category: 'filesystem.symlink',
          title: 'Symbolic link inside shared folder',
          message: 'Folder contains a symbolic link. Some sharing/archiving tools may follow it and include content outside the apparent folder boundary.',
          source: full,
          evidence: target,
          tags: ['filesystem', 'link', 'boundary']
        }));
        continue;
      }
      if (entry.isDirectory()) await visit(full);
      else if (entry.isFile()) files.push(full);
    }
  }
  await visit(root);
  return { files, findings };
}

function mergeOptions(options) {
  return {
    ...DEFAULTS,
    ...options,
    ignore: options.ignore ?? DEFAULTS.ignore,
    zipSafety: { ...DEFAULTS.zipSafety, ...(options.zipSafety ?? {}) },
    gitHistoryLimits: { ...DEFAULTS.gitHistoryLimits, ...(options.gitHistoryLimits ?? {}) }
  };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.category}:${item.source}:${item.path ?? ''}:${item.evidence ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sortFindings(items) {
  const rank = { critical: 5, high: 4, medium: 3, low: 2, info: 1 };
  return [...items].sort((a, b) => rank[b.severity] - rank[a.severity] || a.category.localeCompare(b.category));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
}

export { DEFAULTS };

export function scanBufferTarget(buffer, name = 'dropped-file', options = {}) {
  const config = mergeOptions(options);
  const source = name;
  const type = detectType(buffer, name);
  const findings = inspectBuffer(buffer, type, source, config);
  findings.push(...runPlugins(buffer, { source, name, type }, config.plugins));
  const items = [{
    source,
    relativePath: name,
    size: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    kind: type.kind,
    mime: type.mime
  }];
  if (type.kind === 'zip' && config.maxArchiveDepth > 0) {
    const nested = scanArchiveEntries(buffer, source, name, 1, config);
    findings.push(...nested.findings);
    items.push(...nested.items);
  }
  const uniqueFindings = applyPortableFingerprints(dedupe(findings), name, { targetIsDirectory: false });
  return {
    schemaVersion: 1,
    tool: { name: 'kalypt', version: '0.3.0' },
    target: name,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    summary: summarizeFindings(uniqueFindings),
    findings: sortFindings(uniqueFindings),
    items
  };
}
