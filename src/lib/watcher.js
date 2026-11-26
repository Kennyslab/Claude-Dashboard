/**
 * Change detection for live updates.
 *
 * `fs.watch` is unreliable across platforms for deep trees, so instead we poll
 * a cheap fingerprint (newest mtime + file count + byte total) of the
 * directories we care about. Clients are notified over SSE only when the
 * fingerprint actually changes.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { paths } from './paths.js';

export async function fingerprint() {
  const p = paths();
  let files = 0, bytes = 0, newest = 0;
  async function walk(dir, depth = 0) {
    if (depth > 2) return;
    let entries = [];
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { await walk(full, depth + 1); continue; }
      if (!e.isFile()) continue;
      try {
        const st = await fsp.stat(full);
        files++; bytes += st.size;
        if (st.mtimeMs > newest) newest = st.mtimeMs;
      } catch { /* vanished mid-scan */ }
    }
  }
  await walk(p.projects);
  for (const f of [p.settings, p.localSettings, path.join(p.dashboardState, 'events.jsonl')]) {
    try { const st = fs.statSync(f); files++; bytes += st.size; if (st.mtimeMs > newest) newest = st.mtimeMs; } catch { /* absent */ }
  }
  return `${files}:${bytes}:${Math.round(newest)}`;
}

export function createWatcher({ intervalMs = 2500, onChange }) {
  let last = null;
  let timer = null;
  let stopped = false;

  async function tick() {
    if (stopped) return;
    try {
      const fp = await fingerprint();
      if (last !== null && fp !== last) onChange(fp);
      last = fp;
    } catch { /* keep polling */ }
    timer = setTimeout(tick, intervalMs);
    timer.unref?.();
  }

  tick();
  return { stop() { stopped = true; if (timer) clearTimeout(timer); } };
}

/** Follow a growing file and yield each newly appended line. */
export function tailFile(file, onLine, { intervalMs = 1200 } = {}) {
  let offset = 0;
  let stopped = false;
  try { offset = fs.statSync(file).size; } catch { offset = 0; }

  const timer = setInterval(() => {
    if (stopped) return;
    let size;
    try { size = fs.statSync(file).size; } catch { return; }
    if (size < offset) offset = 0;           // file was rotated
    if (size === offset) return;
    const stream = fs.createReadStream(file, { start: offset, end: size - 1, encoding: 'utf8' });
    let buf = '';
    stream.on('data', (c) => { buf += c; });
    stream.on('end', () => {
      offset = size;
      for (const line of buf.split('\n')) {
        if (!line.trim()) continue;
        try { onLine(JSON.parse(line)); } catch { /* partial line */ }
      }
    });
    stream.on('error', () => {});
  }, intervalMs);
  timer.unref?.();

  return { stop() { stopped = true; clearInterval(timer); } };
}
