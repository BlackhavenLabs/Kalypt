import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { scanBufferTarget } from '../scan.js';
import { cleanBuffer } from '../clean/index.js';
import { applyPolicy, policyNames } from '../policy.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MAX_BODY = 128 * 1024 * 1024;

export async function startUi({ port = 0, open = true } = {}) {
  const assets = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
    '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
    '/brand-symbol.webp': ['brand-symbol.webp', 'image/webp']
  };
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      setSecurityHeaders(res);

      if (req.method === 'GET' && assets[url.pathname]) {
        const [name, type] = assets[url.pathname];
        res.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
        res.end(await fs.readFile(path.join(here, name)));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/api/meta') {
        return json(res, 200, { name: 'Kalypt', version: '0.3.0', policies: policyNames(), localOnly: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/scan') {
        const name = safeName(url.searchParams.get('name') || 'dropped-file');
        const policy = url.searchParams.get('policy') || 'public';
        const body = await readBody(req, MAX_BODY);
        const report = applyPolicy(scanBufferTarget(body, name), policy);
        return json(res, 200, report);
      }
      if (req.method === 'POST' && url.pathname === '/api/clean') {
        const name = safeName(url.searchParams.get('name') || 'file');
        const policy = url.searchParams.get('policy') || 'public';
        const body = await readBody(req, MAX_BODY);
        const { cleaned, type } = cleanBuffer(body, name);
        const verification = applyPolicy(scanBufferTarget(cleaned, cleanName(name)), policy);
        res.writeHead(200, {
          'content-type': type.mime || 'application/octet-stream',
          'content-disposition': `attachment; filename="${cleanName(name)}"`,
          'content-length': cleaned.length,
          'x-kalypt-findings-after': String(verification.summary.total),
          'x-kalypt-removable-after': String(verification.summary.removable),
          'cache-control': 'no-store'
        });
        res.end(cleaned);
        return;
      }
      json(res, 404, { error: 'Not found' });
    } catch (error) {
      json(res, error?.code === 'BODY_TOO_LARGE' ? 413 : 400, { error: error?.message ?? String(error) });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/`;
  if (open) openBrowser(url);
  return { server, url, port: address.port };
}

function setSecurityHeaders(res) {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('cross-origin-resource-policy', 'same-origin');
  res.setHeader('content-security-policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}

function readBody(req, max) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > max) {
        const error = new Error(`Dropped file exceeds the ${Math.floor(max / 1024 / 1024)} MiB UI limit.`);
        error.code = 'BODY_TOO_LARGE';
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, status, payload) {
  const body = Buffer.from(`${JSON.stringify(payload)}\n`);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': body.length, 'cache-control': 'no-store' });
  res.end(body);
}

function safeName(value) {
  return path.basename(String(value)).replace(/[\r\n"]/g, '_').slice(0, 240) || 'file';
}

function cleanName(name) {
  const ext = path.extname(name);
  const base = ext ? name.slice(0, -ext.length) : name;
  return `${base}.cleaned${ext}`.replace(/"/g, '_');
}

function openBrowser(url) {
  const command = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
      : ['xdg-open', [url]];
  const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore' });
  child.unref();
}
