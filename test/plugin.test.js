import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadPlugins } from '../src/plugins.js';
import { scanTarget } from '../src/scan.js';

test('explicit local plugins receive bytes and emit namespaced findings', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kalypt-plugin-'));
  const pluginPath = path.join(dir, 'plugin.mjs');
  const file = path.join(dir, 'private-notes.txt');
  await fs.writeFile(pluginPath, `export default { apiVersion: 1, id: 'test.plugin', name: 'Test plugin', inspect(buffer, context) { return context.name.includes('private') ? [{ severity: 'medium', category: 'name', title: 'Private filename', message: 'Review this filename.', evidence: context.name }] : []; } };`);
  await fs.writeFile(file, 'hello');
  const plugins = await loadPlugins([pluginPath]);
  const report = await scanTarget(file, { plugins });
  assert.ok(report.findings.some((f) => f.category === 'plugin.test.plugin.name'));
});
