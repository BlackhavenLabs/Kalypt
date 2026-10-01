import crypto from 'node:crypto';
import path from 'node:path';

export function applyPortableFingerprints(findings, target, { targetIsDirectory = false } = {}) {
  return findings.map((item) => {
    const locator = portableSource(item.source, target, targetIsDirectory);
    const material = JSON.stringify({
      category: item.category,
      source: locator,
      path: item.path ? portableSource(item.path, target, targetIsDirectory) : '',
      title: item.title,
      evidence: item.evidence ?? ''
    });
    const hash = crypto.createHash('sha256').update(material).digest('hex').slice(0, 16);
    return { ...item, id: `f_${hash}` };
  });
}

function portableSource(source, target, targetIsDirectory) {
  const text = String(source ?? '');
  const bang = text.indexOf('!');
  const outer = bang === -1 ? text : text.slice(0, bang);
  const suffix = bang === -1 ? '' : text.slice(bang);
  let portable = outer;

  if (targetIsDirectory) {
    const relative = path.relative(target, outer);
    if (relative === '') portable = '.';
    else if (!relative.startsWith('..') && !path.isAbsolute(relative)) portable = relative;
  } else if (path.resolve(outer) === path.resolve(target)) {
    portable = path.basename(target);
  }

  return `${portable.replace(/\\/g, '/')}${suffix.replace(/\\/g, '/')}`;
}
