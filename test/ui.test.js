import test from 'node:test';
import assert from 'node:assert/strict';
import { startUi } from '../src/ui/server.js';

function fakeGitHubToken() {
  return 'gh' + 'p_' + '123456789012345678901234567890123456';
}

const secret = `token=${fakeGitHubToken()}`;

test('local UI serves the app and scans raw file bytes', async (t) => {
  const app = await startUi({ port: 0, open: false });
  t.after(() => new Promise((resolve) => app.server.close(resolve)));
  const home = await fetch(app.url);
  assert.equal(home.status, 200);
  assert.match(await home.text(), /Drop something before you send it/i);
  const scan = await fetch(`${app.url}api/scan?name=config.txt&policy=source-release`, {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: secret
  });
  assert.equal(scan.status, 200);
  const report = await scan.json();
  assert.ok(report.findings.some((f) => f.category === 'secret.github-token'));
  assert.equal(report.findings.find((f) => f.category === 'secret.github-token').severity, 'critical');
});
