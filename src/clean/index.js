import fs from 'node:fs/promises';
import path from 'node:path';
import { detectType } from '../detect.js';
import { cleanImage } from './image.js';
import { cleanOfficeProperties } from './office.js';
import { cleanMedia } from './media.js';
import { cleanedOutputPath } from '../util/path.js';
import { scanTarget } from '../scan.js';

export async function cleanFile(input, options = {}) {
  const absolute = path.resolve(input);
  const stat = await fs.stat(absolute);
  if (!stat.isFile()) throw new Error('Cleaning currently accepts one regular file at a time');
  const before = await fs.readFile(absolute);
  const type = detectType(before, absolute);
  let after;
  let action;

  if (type.kind === 'jpeg' || type.kind === 'png') {
    after = cleanImage(before, type.kind);
    action = 'Removed image metadata blocks while preserving encoded image data.';
  } else if (['docx', 'xlsx', 'pptx'].includes(type.kind)) {
    after = cleanOfficeProperties(before, options);
    action = 'Cleared standard Office core properties and removed custom properties.';
  } else if (type.kind === 'mp3' || type.kind === 'wav') {
    after = cleanMedia(before, type.kind);
    action = 'Removed supported container metadata while preserving media payload data.';
  } else {
    throw new Error(`No safe built-in cleaner is available yet for ${type.kind}`);
  }

  const output = path.resolve(options.output ?? cleanedOutputPath(absolute));
  if (output === absolute) throw new Error('Refusing to overwrite the original; choose a separate output path');
  await fs.writeFile(output, after, { flag: options.force ? 'w' : 'wx' });
  const verification = await scanTarget(output, options.scanOptions);
  return {
    input: absolute,
    output,
    type,
    action,
    originalBytes: before.length,
    cleanedBytes: after.length,
    verification
  };
}

export function cleanBuffer(buffer, name = 'file') {
  const type = detectType(buffer, name);
  let cleaned;
  if (type.kind === 'jpeg' || type.kind === 'png') cleaned = cleanImage(buffer, type.kind);
  else if (['docx', 'xlsx', 'pptx'].includes(type.kind)) cleaned = cleanOfficeProperties(buffer);
  else if (type.kind === 'mp3' || type.kind === 'wav') cleaned = cleanMedia(buffer, type.kind);
  else throw new Error(`No safe built-in cleaner is available yet for ${type.kind}`);
  return { cleaned, type };
}
