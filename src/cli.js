import fs from 'node:fs/promises';
import path from 'node:path';
import { scanTarget } from './scan.js';
import { cleanFile } from './clean/index.js';
import { renderTextReport, renderMarkdownReport } from './report.js';
import { renderSarif } from './report-sarif.js';
import { renderHtmlReport } from './report-html.js';
import { applyPolicy, policyNames } from './policy.js';
import { loadBaseline, writeBaseline, applyBaseline } from './baseline.js';
import { startUi } from './ui/server.js';
import { installPrePushHook, removePrePushHook } from './integrations/git-hook.js';
import { loadPlugins } from './plugins.js';

const VERSION = '0.3.0';

export async function main(argv) {
  const [command, ...rest] = argv;
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(help());
    return;
  }
  if (command === '--version' || command === '-v' || command === 'version') {
    console.log(VERSION);
    return;
  }

  if (command === 'scan' || command === 'inspect') return scanCommand(rest);
  if (command === 'clean') return cleanCommand(rest);
  if (command === 'baseline') return baselineCommand(rest);
  if (command === 'ui') return uiCommand(rest);
  if (command === 'hook') return hookCommand(rest);

  // Friendly default: `kalypt thing` means `kalypt scan thing`.
  return scanCommand(argv);
}

async function scanCommand(args) {
  const { positional, flags } = parseArgs(args);
  const target = positional[0];
  if (!target) throw new Error('scan requires a file or directory');
  const plugins = await loadPlugins(asArray(flags.plugin));
  let report = await scanTarget(target, {
    maxFileBytes: byteFlag(flags['max-file-size']) ?? undefined,
    scanBinaryStrings: Boolean(flags['binary-strings']),
    gitTrackedOnly: Boolean(flags['git-tracked-only']),
    gitHistory: !flags['no-git-history'],
    maxArchiveDepth: numberFlag(flags['archive-depth'], 0, 10),
    plugins
  });

  report = applyPolicy(report, String(flags.policy ?? 'public'));

  if (flags['write-baseline']) {
    const baselinePath = path.resolve(String(flags['write-baseline']));
    await writeBaseline(baselinePath, report);
    console.error(`Wrote baseline to ${baselinePath}`);
  }

  if (flags.baseline) {
    const baseline = await loadBaseline(path.resolve(String(flags.baseline)));
    report = applyBaseline(report, baseline, { includeBaselined: Boolean(flags['include-baselined']) });
  }

  let output;
  const format = String(flags.format ?? 'text').toLowerCase();
  if (format === 'json') output = `${JSON.stringify(report, null, 2)}\n`;
  else if (format === 'md' || format === 'markdown') output = `${renderMarkdownReport(report)}\n`;
  else if (format === 'sarif') output = `${renderSarif(report)}\n`;
  else if (format === 'html') output = `${renderHtmlReport(report)}\n`;
  else if (format === 'text') output = `${renderTextReport(report, { color: !flags['no-color'] })}\n`;
  else throw new Error(`Unknown report format: ${format}`);

  if (flags.output) {
    await fs.writeFile(path.resolve(String(flags.output)), output, 'utf8');
    console.log(`Wrote report to ${path.resolve(String(flags.output))}`);
  } else {
    process.stdout.write(output);
  }

  const failOn = flags['fail-on'];
  if (failOn && reachesThreshold(report, String(failOn))) process.exitCode = 2;
}

async function baselineCommand(args) {
  const { positional, flags } = parseArgs(args);
  const target = positional[0];
  const output = flags.output;
  if (!target) throw new Error('baseline requires a file or directory');
  if (!output) throw new Error('baseline requires --output <file>');
  const plugins = await loadPlugins(asArray(flags.plugin));
  let report = await scanTarget(target, { gitHistory: !flags['no-git-history'], plugins });
  report = applyPolicy(report, String(flags.policy ?? 'public'));
  const destination = path.resolve(String(output));
  await writeBaseline(destination, report);
  console.log(`Wrote ${report.findings.length} finding fingerprint(s) to ${destination}`);
}

async function uiCommand(args) {
  const { flags } = parseArgs(args);
  const port = flags.port === undefined ? 0 : numberFlag(flags.port, 0, 65535);
  const app = await startUi({ port, open: !flags['no-open'] });
  console.log(`Kalypt UI: ${app.url}`);
  console.log('Press Ctrl+C to stop.');
}

async function hookCommand(args) {
  const [action = 'install', repoArg] = args.filter((arg) => !arg.startsWith('--'));
  const { flags } = parseArgs(args.filter((arg) => arg.startsWith('--')));
  const repo = repoArg ? path.resolve(repoArg) : process.cwd();
  if (action === 'install') {
    const hook = await installPrePushHook(repo, { force: Boolean(flags.force) });
    console.log(`Installed Kalypt pre-push hook: ${hook}`);
    return;
  }
  if (action === 'remove' || action === 'uninstall') {
    const removed = await removePrePushHook(repo);
    console.log(removed ? 'Removed Kalypt pre-push hook.' : 'No Kalypt pre-push hook was installed.');
    return;
  }
  throw new Error('hook action must be install or remove');
}

async function cleanCommand(args) {
  const { positional, flags } = parseArgs(args);
  const input = positional[0];
  if (!input) throw new Error('clean requires a file');
  const result = await cleanFile(input, {
    output: flags.output ? String(flags.output) : undefined,
    force: Boolean(flags.force),
    removeCustomProperties: flags['keep-custom-properties'] ? false : true
  });
  console.log(`Clean copy: ${result.output}`);
  console.log(result.action);
  console.log(`Size: ${result.originalBytes} → ${result.cleanedBytes} bytes`);
  console.log(`Verification: ${result.verification.summary.total} finding(s) remain`);
}

function parseArgs(args) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const [name, inline] = token.slice(2).split('=', 2);
    if (inline !== undefined) addFlag(flags, name, inline);
    else if (i + 1 < args.length && !args[i + 1].startsWith('-') && takesValue(name)) addFlag(flags, name, args[++i]);
    else flags[name] = true;
  }
  return { positional, flags };
}

function addFlag(flags, name, value) {
  if (name === 'plugin') {
    if (!Array.isArray(flags[name])) flags[name] = flags[name] === undefined ? [] : [flags[name]];
    flags[name].push(value);
  } else flags[name] = value;
}

function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function takesValue(name) {
  return ['format', 'output', 'fail-on', 'max-file-size', 'policy', 'baseline', 'write-baseline', 'archive-depth', 'port', 'plugin'].includes(name);
}

function byteFlag(value) {
  if (value === undefined) return undefined;
  const match = String(value).trim().match(/^(\d+(?:\.\d+)?)\s*(b|kb|kib|mb|mib|gb|gib)?$/i);
  if (!match) throw new Error(`Invalid byte size: ${value}`);
  const n = Number(match[1]);
  const multiplier = ({ b: 1, kb: 1000, kib: 1024, mb: 1e6, mib: 1024 ** 2, gb: 1e9, gib: 1024 ** 3 }[match[2]?.toLowerCase() ?? 'b']);
  return Math.floor(n * multiplier);
}

function numberFlag(value, min, max) {
  if (value === undefined) return undefined;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) throw new Error(`Expected an integer from ${min} to ${max}, got ${value}`);
  return number;
}

function reachesThreshold(report, threshold) {
  const rank = { info: 1, low: 2, medium: 3, high: 4, critical: 5 };
  const target = rank[threshold.toLowerCase()];
  if (!target) throw new Error(`Unknown severity threshold: ${threshold}`);
  return report.findings.some((item) => rank[item.severity] >= target);
}

function help() {
  return `Kalypt ${VERSION}\n\nInspect what a file, folder, archive, document, image, media file, or repository may reveal before you share it.\n\nUsage:\n  kalypt <target>\n  kalypt scan <target> [options]\n  kalypt clean <file> [options]\n  kalypt baseline <target> --output .kalypt-baseline.json\n  kalypt ui [--port 43117] [--no-open]\n  kalypt hook install [repo] [--force]\n  kalypt hook remove [repo]\n\nScan options:\n  --format text|json|md|html|sarif\n                              Report format (default: text)\n  --output <path>             Write the report to a file\n  --policy <name>             ${policyNames().join(' | ')}\n  --baseline <path>           Hide findings captured in an earlier baseline\n  --include-baselined         Keep baseline matches and mark them instead of hiding them\n  --write-baseline <path>     Save current finding fingerprints during this scan\n  --fail-on <severity>        Exit 2 when findings reach the threshold\n  --max-file-size <size>      Deep-scan size limit, e.g. 128MiB\n  --archive-depth <0-10>      Nested ZIP scan depth (default: 3)\n  --git-tracked-only          For a Git repo, scan only currently tracked files\n  --no-git-history            Skip bounded Git-history secret inspection\n  --binary-strings            Search printable strings in unknown binaries\n  --plugin <path>             Load an explicitly trusted local inspection plugin (repeatable)\n  --no-color                  Disable terminal color\n\nClean options:\n  --output <path>             Clean-copy destination\n  --force                     Replace an existing clean-copy destination\n  --keep-custom-properties    Preserve Office custom document properties\n\nBuilt-in safe cleaners:\n  JPEG, PNG, DOCX, XLSX, PPTX, MP3, WAV\n\nSafety:\n  Kalypt never overwrites the original during cleaning. Cleaners create a separate copy and scan it again.\n`;
}
