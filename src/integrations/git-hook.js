import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const MARKER = '# installed by Kalypt';

export async function installPrePushHook(repo = process.cwd(), { force = false } = {}) {
  const root = gitRoot(repo);
  if (!root) throw new Error('Not inside a Git repository');
  const hooks = path.join(root, '.git', 'hooks');
  const hook = path.join(hooks, 'pre-push');
  await fs.mkdir(hooks, { recursive: true });
  let existing = '';
  try { existing = await fs.readFile(hook, 'utf8'); } catch { /* absent */ }
  if (existing && !existing.includes(MARKER) && !force) throw new Error(`A pre-push hook already exists at ${hook}; rerun with --force to replace it.`);
  const body = `#!/bin/sh\n${MARKER}\nset -e\nif ! command -v kalypt >/dev/null 2>&1; then\n  echo "Kalypt pre-push hook: kalypt is not on PATH; skipping." >&2\n  exit 0\nfi\necho "Kalypt: inspecting tracked source before push..." >&2\nkalypt scan . --policy source-release --git-tracked-only --no-git-history --fail-on high --no-color\n`;
  await fs.writeFile(hook, body, { mode: 0o755 });
  await fs.chmod(hook, 0o755);
  return hook;
}

export async function removePrePushHook(repo = process.cwd()) {
  const root = gitRoot(repo);
  if (!root) throw new Error('Not inside a Git repository');
  const hook = path.join(root, '.git', 'hooks', 'pre-push');
  let existing;
  try { existing = await fs.readFile(hook, 'utf8'); } catch { return false; }
  if (!existing.includes(MARKER)) throw new Error('Existing pre-push hook was not installed by Kalypt; refusing to remove it.');
  await fs.rm(hook);
  return true;
}

function gitRoot(cwd) {
  const result = spawnSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', windowsHide: true });
  return result.status === 0 ? result.stdout.trim() : null;
}
