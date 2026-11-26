/**
 * Cost estimation.
 *
 * Prices are USD per million tokens and are matched against the model id with
 * the most specific pattern winning. Values can be overridden entirely from
 * `~/.claude/dashboard/pricing.json` so the dashboard never needs a release to
 * stay accurate.
 */
import path from 'node:path';
import { paths, readJsonSafe } from './paths.js';

export const DEFAULT_PRICING = {
  // pattern (substring match, longest wins) -> { input, output, cacheWrite, cacheRead }
  'opus':   { input: 15,   output: 75,  cacheWrite: 18.75, cacheRead: 1.5 },
  'sonnet': { input: 3,    output: 15,  cacheWrite: 3.75,  cacheRead: 0.3 },
  'haiku':  { input: 0.8,  output: 4,   cacheWrite: 1.0,   cacheRead: 0.08 },
  'fable':  { input: 15,   output: 75,  cacheWrite: 18.75, cacheRead: 1.5 },
  'mythos': { input: 15,   output: 75,  cacheWrite: 18.75, cacheRead: 1.5 },
};

const FALLBACK = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };

let cache = null;

export function pricingTable() {
  if (cache) return cache;
  const file = path.join(paths().dashboardState, 'pricing.json');
  const user = readJsonSafe(file, null);
  cache = user && typeof user === 'object' ? { ...DEFAULT_PRICING, ...user } : { ...DEFAULT_PRICING };
  return cache;
}

export function resetPricingCache() { cache = null; }

export function rateFor(model, table = pricingTable()) {
  if (!model) return FALLBACK;
  const id = String(model).toLowerCase();
  let best = null;
  let bestLen = -1;
  for (const [pattern, rate] of Object.entries(table)) {
    const p = pattern.toLowerCase();
    if (id.includes(p) && p.length > bestLen) { best = rate; bestLen = p.length; }
  }
  return best || FALLBACK;
}

/**
 * Estimate the USD cost of a single usage record.
 * Cache reads and cache writes are billed at their own rate, which is why a
 * naive input+output calculation under-reports heavily cached sessions.
 */
export function costOf(usage, model, table = pricingTable()) {
  if (!usage) return 0;
  const r = rateFor(model, table);
  const m = 1e-6;
  return (
    (usage.input || 0) * r.input * m +
    (usage.output || 0) * r.output * m +
    (usage.cacheWrite || 0) * r.cacheWrite * m +
    (usage.cacheRead || 0) * r.cacheRead * m
  );
}
