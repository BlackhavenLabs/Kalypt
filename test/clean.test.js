import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeZip, readZip } from '../src/formats/zip.js';
import { cleanFile } from '../src/clean/index.js';

function officeFixture() {
  return writeZip([
    { name: '[Content_Types].xml', data: Buffer.from('<Types></Types>') },
    { name: 'word/document.xml', data: Buffer.from('<w:document/>') },
    { name: 'docProps/core.xml', data: Buffer.from('<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dc="x"><dc:creator>Alice</dc:creator><cp:lastModifiedBy>Bob</cp:lastModifiedBy><cp:revision>12</cp:revision></cp:coreProperties>') },
    { name: 'docProps/custom.xml', data: Buffer.from('<Properties><property name="Internal">secret</property></Properties>') }
  ]);
}

test('Office cleaner creates a separate scrubbed copy', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kalypt-clean-'));
  const input = path.join(dir, 'resume.docx');
  await fs.writeFile(input, officeFixture());
  const result = await cleanFile(input);
  assert.notEqual(result.input, result.output);
  const cleaned = await fs.readFile(result.output);
  const entries = readZip(cleaned);
  const core = entries.find((e) => e.name === 'docProps/core.xml').data.toString();
  assert.equal(core.includes('Alice'), false);
  assert.equal(core.includes('Bob'), false);
  assert.equal(entries.some((e) => e.name === 'docProps/custom.xml'), false);
});
