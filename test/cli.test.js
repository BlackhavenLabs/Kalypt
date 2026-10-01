import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(repo, 'bin', 'kalypt.js');

test('shipped CLI parses and scans a file end to end', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kalypt-cli-'));
  const file = path.join(dir, 'note.txt');
  await fs.writeFile(file, 'hello from kalypt\n');
  const result = spawnSync(process.execPath, [cli, 'scan', file, '--format', 'json', '--no-git-history'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.tool.version, '0.3.0');
  assert.equal(report.items.length, 1);
});

test('CLI version command matches package release', () => {
  const result = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), '0.3.0');
});
