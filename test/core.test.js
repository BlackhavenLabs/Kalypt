import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { detectType } from '../src/detect.js';
import { inspectText } from '../src/inspectors/text.js';
import { readZip, writeZip } from '../src/formats/zip.js';
import { scanTarget } from '../src/scan.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000000020001e221bc330000000049454e44ae426082', 'hex');

test('detects common file signatures', () => {
  assert.equal(detectType(Buffer.from('%PDF-1.7\n'), 'x.bin').kind, 'pdf');
  assert.equal(detectType(PNG, 'x.bin').kind, 'png');
  assert.equal(detectType(Buffer.from('hello world'), 'x.txt').kind, 'text');
});

test('secret scanner redacts credential evidence', () => {
  const findings = inspectText('token = ghp_123456789012345678901234567890123456', 'fixture', 'fixture');
  const secret = findings.find((f) => f.category === 'secret.github-token');
  assert.ok(secret);
  assert.ok(secret.evidence.includes('…'));
  assert.equal(secret.evidence.includes('123456789012345678901234567890'), false);
});

test('ZIP writer and reader round-trip files', () => {
  const zip = writeZip([
    { name: 'hello.txt', data: Buffer.from('hello') },
    { name: 'folder/data.json', data: Buffer.from('{"ok":true}') }
  ]);
  const entries = readZip(zip);
  assert.deepEqual(entries.map((e) => e.name), ['hello.txt', 'folder/data.json']);
  assert.equal(entries[0].data.toString(), 'hello');
  assert.equal(entries[1].data.toString(), '{"ok":true}');
});

test('scanTarget finds local paths and emails', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kalypt-'));
  const file = path.join(dir, 'note.txt');
  await fs.writeFile(file, 'C:\\Users\\alice\\secret\\notes.txt alice@example.com');
  const report = await scanTarget(file);
  assert.ok(report.findings.some((f) => f.category === 'identity.local-path'));
  assert.ok(report.findings.some((f) => f.category === 'identity.email'));
});

test('specific secret patterns are not duplicated as generic secret findings', () => {
  const findings = inspectText('token = ghp_123456789012345678901234567890123456', 'fixture', 'fixture');
  assert.equal(findings.filter((f) => f.category === 'secret.github-token').length, 1);
  assert.equal(findings.filter((f) => f.category === 'secret.generic-secret').length, 0);
});
