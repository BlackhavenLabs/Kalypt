import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { writeZip } from '../src/formats/zip.js';
import { scanTarget } from '../src/scan.js';
import { cleanFile } from '../src/clean/index.js';
import { applyPolicy } from '../src/policy.js';
import { writeBaseline, loadBaseline, applyBaseline } from '../src/baseline.js';
import { renderSarif } from '../src/report-sarif.js';
import { renderHtmlReport } from '../src/report-html.js';

function fakeGitHubToken() {
  return 'gh' + 'p_' + '123456789012345678901234567890123456';
}

function id3TextFrame(id, value) {
  const payload = Buffer.concat([Buffer.from([3]), Buffer.from(value)]);
  const header = Buffer.alloc(10);
  header.write(id, 0, 'ascii');
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

function synchsafe(value) {
  return Buffer.from([(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f]);
}

function mp3Fixture() {
  const frame = id3TextFrame('TENC', 'Alice Workstation');
  const header = Buffer.concat([Buffer.from('ID3'), Buffer.from([3, 0, 0]), synchsafe(frame.length)]);
  return Buffer.concat([header, frame, Buffer.from([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0])]);
}

function wavFixture() {
  const value = Buffer.from('Alice\0');
  const sub = Buffer.alloc(8 + value.length + (value.length % 2));
  sub.write('IART', 0, 'ascii');
  sub.writeUInt32LE(value.length, 4);
  value.copy(sub, 8);
  const info = Buffer.concat([Buffer.from('INFO'), sub]);
  const listHeader = Buffer.alloc(8);
  listHeader.write('LIST', 0, 'ascii');
  listHeader.writeUInt32LE(info.length, 4);
  const fmt = Buffer.alloc(24);
  fmt.write('fmt ', 0, 'ascii');
  fmt.writeUInt32LE(16, 4);
  fmt.writeUInt16LE(1, 8);
  fmt.writeUInt16LE(1, 10);
  fmt.writeUInt32LE(8000, 12);
  fmt.writeUInt32LE(8000, 16);
  fmt.writeUInt16LE(1, 20);
  fmt.writeUInt16LE(8, 22);
  const data = Buffer.from('data\x01\x00\x00\x00\x80', 'binary');
  const body = Buffer.concat([Buffer.from('WAVE'), fmt, listHeader, info, data]);
  const riff = Buffer.alloc(8);
  riff.write('RIFF', 0, 'ascii');
  riff.writeUInt32LE(body.length, 4);
  return Buffer.concat([riff, body]);
}

test('nested ZIPs are recursively inspected', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kalypt-nested-'));
  const inner = writeZip([{ name: 'secret.txt', data: Buffer.from(`token=${fakeGitHubToken()}`) }]);
  const outer = writeZip([{ name: 'inner.zip', data: inner }]);
  const file = path.join(dir, 'outer.zip');
  await fs.writeFile(file, outer);
  const report = await scanTarget(file, { maxArchiveDepth: 3 });
  assert.ok(report.findings.some((f) => f.category === 'secret.github-token'));
  assert.ok(report.items.some((item) => item.archiveDepth === 2));
});

test('MP3 and WAV metadata can be detected and cleaned', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kalypt-media-'));
  const mp3 = path.join(dir, 'audio.mp3');
  const wav = path.join(dir, 'audio.wav');
  await fs.writeFile(mp3, mp3Fixture());
  await fs.writeFile(wav, wavFixture());
  const mp3Report = await scanTarget(mp3);
  const wavReport = await scanTarget(wav);
  assert.ok(mp3Report.findings.some((f) => f.category === 'media.id3.tenc'));
  assert.ok(wavReport.findings.some((f) => f.category === 'media.wav.iart'));
  const mp3Clean = await cleanFile(mp3);
  const wavClean = await cleanFile(wav);
  assert.equal(mp3Clean.verification.findings.some((f) => f.category.startsWith('media.id3.')), false);
  assert.equal(wavClean.verification.findings.some((f) => f.category.startsWith('media.wav.')), false);
});

test('policy, baseline, SARIF and HTML compose on the same report', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kalypt-policy-'));
  const file = path.join(dir, 'app.txt');
  const baselinePath = path.join(dir, 'baseline.json');
  await fs.writeFile(file, 'C:\\Users\\alice\\project\\file.txt');
  let report = await scanTarget(file);
  report = applyPolicy(report, 'source-release');
  const localPath = report.findings.find((f) => f.category === 'identity.local-path');
  assert.equal(localPath.severity, 'high');
  await writeBaseline(baselinePath, report);
  const baseline = await loadBaseline(baselinePath);
  const filtered = applyBaseline(report, baseline);
  assert.equal(filtered.findings.length, 0);
  assert.match(renderSarif(report), /"version": "2.1.0"/);
  assert.match(renderHtmlReport(report), /<!doctype html>/i);
});

test('Git history scanning finds a secret that was deleted later', async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kalypt-git-'));
  const run = (args) => spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
  if (spawnSync('git', ['--version']).status !== 0) return t.skip('git unavailable');
  run(['init']);
  run(['config', 'user.name', 'Test User']);
  run(['config', 'user.email', 'test@example.com']);
  await fs.writeFile(path.join(dir, 'secret.txt'), `token=${fakeGitHubToken()}\n`);
  run(['add', '.']);
  run(['commit', '-m', 'add secret']);
  await fs.rm(path.join(dir, 'secret.txt'));
  run(['add', '-A']);
  run(['commit', '-m', 'remove secret']);
  const report = await scanTarget(dir, { gitHistory: true, gitHistoryLimits: { maxBlobs: 100, maxBlobBytes: 100000 } });
  assert.ok(report.findings.some((f) => f.category === 'git.history.secret.github-token'));
});

test('finding fingerprints are portable across checkout paths', async () => {
  const a = await fs.mkdtemp(path.join(os.tmpdir(), 'kalypt-fp-a-'));
  const b = await fs.mkdtemp(path.join(os.tmpdir(), 'kalypt-fp-b-'));
  await fs.mkdir(path.join(a, 'src'));
  await fs.mkdir(path.join(b, 'src'));
  await fs.writeFile(path.join(a, 'src', 'config.txt'), 'C:\\Users\\alice\\thing\\file.txt');
  await fs.writeFile(path.join(b, 'src', 'config.txt'), 'C:\\Users\\alice\\thing\\file.txt');
  const ra = await scanTarget(a, { gitHistory: false });
  const rb = await scanTarget(b, { gitHistory: false });
  const fa = ra.findings.find((f) => f.category === 'identity.local-path');
  const fb = rb.findings.find((f) => f.category === 'identity.local-path');
  assert.equal(fa.id, fb.id);
});
