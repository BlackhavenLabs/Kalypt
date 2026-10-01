import { readZip } from '../formats/zip.js';
import { finding, Severity } from '../model.js';
import { inspectText } from './text.js';

export function inspectOffice(buffer, kind, source, options = {}) {
  const findings = [];
  let entries;
  try {
    entries = readZip(buffer, options.zipSafety);
  } catch (error) {
    return [finding({
      severity: Severity.HIGH,
      category: 'archive.invalid',
      title: 'Could not safely inspect Office package',
      message: error.message,
      source,
      tags: ['office', 'archive']
    })];
  }

  const byName = new Map(entries.map((entry) => [entry.name, entry]));
  const core = byName.get('docProps/core.xml');
  if (core) findings.push(...inspectCoreProperties(core.data.toString('utf8'), source));

  if (byName.has('docProps/custom.xml')) findings.push(finding({
    severity: Severity.MEDIUM,
    category: 'office.custom-properties',
    title: 'Custom document properties',
    message: 'The Office file contains custom properties that may expose internal workflow or identity information.',
    source,
    path: 'docProps/custom.xml',
    removable: true,
    cleaner: 'office.scrub-properties',
    tags: ['office', 'metadata']
  }));

  const names = entries.map((entry) => entry.name);
  const commentNames = names.filter((name) => /(^|\/)(comments\d*\.xml|comments\.xml)$/i.test(name));
  if (commentNames.length) findings.push(finding({
    severity: Severity.MEDIUM,
    category: 'office.comments',
    title: 'Comments present',
    message: `The document package contains ${commentNames.length} comment part${commentNames.length === 1 ? '' : 's'}.`,
    source,
    evidence: commentNames.slice(0, 5).join(', '),
    tags: ['office', 'comments']
  }));

  const noteSlides = names.filter((name) => /^ppt\/notesSlides\/notesSlide\d+\.xml$/i.test(name));
  if (noteSlides.length) findings.push(finding({
    severity: Severity.MEDIUM,
    category: 'office.speaker-notes',
    title: 'PowerPoint speaker notes',
    message: `The presentation contains ${noteSlides.length} speaker-note slide${noteSlides.length === 1 ? '' : 's'}.`,
    source,
    tags: ['office', 'powerpoint', 'notes']
  }));

  const hiddenSheets = findHiddenSheets(byName.get('xl/workbook.xml')?.data.toString('utf8') ?? '');
  for (const sheet of hiddenSheets) findings.push(finding({
    severity: Severity.MEDIUM,
    category: 'office.hidden-sheet',
    title: `${sheet.state === 'veryHidden' ? 'Very hidden' : 'Hidden'} Excel sheet`,
    message: `Workbook sheet “${sheet.name}” is marked ${sheet.state}.`,
    source,
    evidence: sheet.name,
    tags: ['office', 'excel', 'hidden-content']
  }));

  const external = names.filter((name) => /\/externalLinks\//i.test(name));
  if (external.length) findings.push(finding({
    severity: Severity.MEDIUM,
    category: 'office.external-links',
    title: 'External workbook/document links',
    message: 'The Office package contains external-link parts that may reference files or resources outside the document.',
    source,
    evidence: `${external.length} part(s)`,
    tags: ['office', 'external-link']
  }));

  const embedded = names.filter((name) => /\/embeddings\//i.test(name));
  if (embedded.length) findings.push(finding({
    severity: Severity.MEDIUM,
    category: 'office.embedded-object',
    title: 'Embedded objects',
    message: `The Office package contains ${embedded.length} embedded object${embedded.length === 1 ? '' : 's'}.`,
    source,
    evidence: embedded.slice(0, 5).join(', '),
    tags: ['office', 'embedded-content']
  }));

  const macro = names.find((name) => /vbaProject\.bin$/i.test(name));
  if (macro) findings.push(finding({
    severity: Severity.HIGH,
    category: 'office.macro',
    title: 'VBA macro project',
    message: 'The Office package contains a VBA macro project.',
    source,
    path: macro,
    tags: ['office', 'macro', 'active-content']
  }));

  const customXml = names.filter((name) => /^customXml\//i.test(name));
  if (customXml.length) findings.push(finding({
    severity: Severity.LOW,
    category: 'office.custom-xml',
    title: 'Custom XML data',
    message: `The Office package includes ${customXml.length} custom XML part${customXml.length === 1 ? '' : 's'}.`,
    source,
    tags: ['office', 'xml']
  }));

  // Inspect XML and relationship files for paths/secrets but cap to avoid pathological archives.
  for (const entry of entries.slice(0, 300)) {
    if (!/\.(xml|rels|txt|json)$/i.test(entry.name)) continue;
    if (entry.data.length > 4 * 1024 * 1024) continue;
    const textFindings = inspectText(entry.data.toString('utf8'), source, entry.name, { secrets: true });
    findings.push(...textFindings);
  }

  findings.push(finding({
    severity: Severity.INFO,
    category: 'office.package-summary',
    title: 'Office package structure inspected',
    message: `${kind.toUpperCase()} package contains ${entries.length} internal file${entries.length === 1 ? '' : 's'}.`,
    source,
    tags: ['office', 'summary']
  }));

  return dedupe(findings);
}

function inspectCoreProperties(xml, source) {
  const fields = [
    ['dc:creator', 'Creator', Severity.MEDIUM],
    ['cp:lastModifiedBy', 'Last modified by', Severity.MEDIUM],
    ['dcterms:created', 'Created timestamp', Severity.LOW],
    ['dcterms:modified', 'Modified timestamp', Severity.LOW],
    ['cp:revision', 'Revision number', Severity.LOW],
    ['cp:lastPrinted', 'Last printed timestamp', Severity.LOW]
  ];
  const findings = [];
  for (const [tag, label, severity] of fields) {
    const value = xml.match(new RegExp(`<${escapeRegExp(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`))?.[1]?.replace(/<[^>]+>/g, '').trim();
    if (!value) continue;
    findings.push(finding({
      severity,
      category: `office.core.${tag.replace(':', '-')}`,
      title: `Office ${label.toLowerCase()}`,
      message: `The document package exposes ${label.toLowerCase()} metadata.`,
      source,
      path: 'docProps/core.xml',
      evidence: decodeXml(value).slice(0, 180),
      removable: true,
      cleaner: 'office.scrub-properties',
      tags: ['office', 'metadata']
    }));
  }
  return findings;
}

function findHiddenSheets(xml) {
  const out = [];
  const regex = /<sheet\b([^>]*)>/g;
  for (const match of xml.matchAll(regex)) {
    const attrs = match[1];
    const state = attrs.match(/\bstate="(hidden|veryHidden)"/)?.[1];
    if (!state) continue;
    const name = decodeXml(attrs.match(/\bname="([^"]*)"/)?.[1] ?? '(unnamed)');
    out.push({ name, state });
  }
  return out;
}

function decodeXml(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.category}:${item.path ?? ''}:${item.evidence ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
