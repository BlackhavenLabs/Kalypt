import path from 'node:path';

export function displayPath(target, root = process.cwd()) {
  const rel = path.relative(root, target);
  return rel && !rel.startsWith('..') ? rel : target;
}

export function cleanedOutputPath(input, suffix = '.cleaned') {
  const ext = path.extname(input);
  const base = ext ? input.slice(0, -ext.length) : input;
  return `${base}${suffix}${ext}`;
}

export function isWithin(parent, child) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
