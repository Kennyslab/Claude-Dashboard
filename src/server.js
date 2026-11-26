/**
 * The dashboard server.
 *
 * Deliberately dependency-free: `node:http` plus a small static file handler.
 * Binds to 127.0.0.1 by default so nothing is exposed to the network without
 * an explicit --host, and refuses to bind a non-loopback address unless a
 * token is set.
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildRoutes } from './api/routes.js';
import { createWatcher, tailFile } from './lib/watcher.js';
import { scanSessions } from './lib/transcripts.js';
import { eventLogPath } from './lib/mods.js';
import { paths, readJsonSafe } from './lib/paths.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(here, '..', 'public');
const PKG = readJsonSafe(path.resolve(here, '..', 'package.json'), { version: '1.0.0' });

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

export async function createServer(options = {}) {
  const ctx = {
    version: PKG.version,
    readOnly: !!options.readOnly,
    token: options.token || null,
    startedAt: new Date().toISOString(),
  };
  const routes = buildRoutes(ctx);
  const clients = new Set();

  // Warm the session index so the first request is fast.
  scanSessions().catch(() => {});

  const broadcast = (event, data) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) { try { res.write(frame); } catch { clients.delete(res); } }
  };

  const watcher = createWatcher({
    intervalMs: options.pollMs || 2500,
    onChange: async () => {
      try {
        const { sessions } = await scanSessions();
        broadcast('data', { sessions: sessions.length, at: new Date().toISOString() });
      } catch { /* ignore */ }
    },
  });

  let tail = null;
  try {
    const log = eventLogPath();
    await fsp.mkdir(path.dirname(log), { recursive: true });
    if (!fs.existsSync(log)) await fsp.writeFile(log, '');
    tail = tailFile(log, (entry) => broadcast('hook', entry));
  } catch { /* live monitor simply stays quiet */ }

  const server = http.createServer(async (req, res) => {
    const started = process.hrtime.bigint();
    let url;
    try { url = new URL(req.url, 'http://localhost'); } catch { return send(res, 400, { error: 'Bad request URL' }); }
    const pathname = decodeURIComponent(url.pathname);

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');

    if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }

    if (ctx.token) {
      const supplied = url.searchParams.get('token') || req.headers['x-dashboard-token'] ||
        (req.headers.cookie || '').match(/dashboard_token=([^;]+)/)?.[1];
      if (supplied !== ctx.token) {
        if (pathname === '/' && url.searchParams.get('token')) { /* handled above */ }
        return send(res, 401, { error: 'Invalid or missing token. Append ?token=… to the URL.' });
      }
      if (url.searchParams.get('token')) res.setHeader('Set-Cookie', `dashboard_token=${ctx.token}; Path=/; SameSite=Strict; HttpOnly`);
    }

    try {
      if (pathname === '/api/stream') return streamSSE(req, res, clients, broadcast);

      for (const [method, pattern, handler] of routes) {
        const match = pattern.exec(pathname);
        if (!match) continue;
        if (req.method !== method) return send(res, 405, { error: `${pathname} accepts ${method}` });
        if (method === 'POST' || method === 'PUT') req.jsonBody = await readJsonBody(req);
        const result = await handler(req, Object.fromEntries(url.searchParams), match);
        if (result.raw !== undefined) {
          res.writeHead(result.status, { ...result.headers });
          return res.end(result.raw);
        }
        return send(res, result.status, result.body, result.headers);
      }

      if (pathname.startsWith('/api/')) return send(res, 404, { error: `No such endpoint: ${pathname}` });
      return await serveStatic(pathname, res);
    } catch (e) {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      process.stderr.write(`[claude-dashboard] ${req.method} ${pathname} failed after ${ms.toFixed(0)}ms: ${e.stack}\n`);
      return send(res, 500, { error: e.message });
    }
  });

  server.on('close', () => { watcher.stop(); tail?.stop(); for (const c of clients) { try { c.end(); } catch {} } });
  server.keepAliveTimeout = 65000;
  return { server, ctx, broadcast };
}

function send(res, status, body, headers = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': payload.length, 'cache-control': 'no-store', ...headers });
  res.end(payload);
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 1_000_000) throw new Error('Request body too large (limit 1 MB).');
    chunks.push(c);
  }
  if (!chunks.length) return null;
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new Error('Request body is not valid JSON.'); }
}

function streamSSE(req, res, clients, broadcast) {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
  res.write(`event: hello\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  clients.add(res);
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* closed */ } }, 20000);
  ping.unref?.();
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
}

async function serveStatic(pathname, res) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const target = path.resolve(PUBLIC_DIR, rel);
  // Containment check: never serve anything outside public/.
  if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== path.join(PUBLIC_DIR, 'index.html')) {
    return send(res, 403, { error: 'Forbidden' });
  }
  let stat;
  try { stat = await fsp.stat(target); } catch {
    // Unknown paths fall back to the SPA shell so deep links work.
    return serveFile(path.join(PUBLIC_DIR, 'index.html'), res, 200);
  }
  if (stat.isDirectory()) return serveFile(path.join(target, 'index.html'), res, 200);
  return serveFile(target, res, 200, stat);
}

async function serveFile(file, res, status = 200, stat = null) {
  try {
    const st = stat || await fsp.stat(file);
    const etag = `W/"${st.size}-${Math.round(st.mtimeMs)}"`;
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(status, {
      'content-type': type,
      'content-length': st.size,
      etag,
      'cache-control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=60',
    });
    fs.createReadStream(file).pipe(res);
  } catch {
    send(res, 404, { error: 'Not found' });
  }
}

export function randomToken() {
  return crypto.randomBytes(16).toString('hex');
}

export async function listen({ port = 7878, host = '127.0.0.1', ...rest } = {}) {
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1';
  if (!isLoopback && !rest.token && !rest.insecure) {
    throw new Error(
      `Refusing to bind ${host} without a token.\n` +
      `Pass --token <secret> (or --token to generate one), or add --insecure if you really mean it.`
    );
  }
  const { server, ctx } = await createServer(rest);
  await new Promise((resolve, reject) => {
    server.once('error', (e) => {
      if (e.code === 'EADDRINUSE') reject(new Error(`Port ${port} is already in use. Try --port ${port + 1}.`));
      else reject(e);
    });
    server.listen(port, host, resolve);
  });
  return { server, ctx, url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}${ctx.token ? `/?token=${ctx.token}` : '/'}`, port, host };
}

export { paths };
