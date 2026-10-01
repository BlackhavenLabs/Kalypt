import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['bin', 'src', 'scripts', 'test', 'examples'];
let failed = false;
for (const root of roots) await visit(root);
if (failed) process.exitCode = 1;
else console.log('lint: basic repository checks passed');

async function visit(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await visit(full);
    else if (/\.(js|mjs|json|md)$/.test(entry.name)) {
      const text = await fs.readFile(full, 'utf8');
      if (/\r/.test(text)) { console.error(`${full}: CR characters found`); failed = true; }
      if (/ +$/m.test(text)) { console.error(`${full}: trailing whitespace`); failed = true; }
      if (/\.(js|mjs)$/.test(entry.name)) {
        const check = spawnSync(process.execPath, ['--check', full], { encoding: 'utf8' });
        if (check.status !== 0) {
          console.error(`${full}: syntax check failed\n${check.stderr}`);
          failed = true;
        }
      }
    }
  }
}
