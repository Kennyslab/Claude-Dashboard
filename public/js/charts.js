/**
 * Charts, drawn by hand as SVG.
 *
 * No charting library: every mark is positioned here, which keeps the bundle at
 * zero dependencies and lets the colour encoding stay consistent with the rest
 * of the interface (blue = volume, sand = money, teal = cache).
 */
import { svg, el, money, tokens, count } from './ui.js';

const PAD = { top: 12, right: 10, bottom: 22, left: 44 };


/**
 * Render an SVG at its true pixel width.
 * A fixed viewBox with preserveAspectRatio="none" stretches text horizontally,
 * so instead the chart is rebuilt whenever its container width changes.
 */
function responsive(height, build) {
  const host = el('div', { style: { width: '100%' } });
  let last = 0;
  const paint = (w) => {
    const width = Math.max(320, Math.round(w));
    if (width === last) return;
    last = width;
    host.replaceChildren(build(width, height));
  };
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver((entries) => paint(entries[0].contentRect.width)).observe(host);
  }
  requestAnimationFrame(() => paint(host.clientWidth || 900));
  paint(900);
  return host;
}

const niceMax = (v) => {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag * 2) / 2 * mag;
};

/**
 * Dual-series trace: filled area for money, line for token volume.
 * This is the dashboard's hero mark.
 */
export function traceChart(points, opts = {}) {
  return responsive(opts.height || 190, (W, H) => buildTrace(points, W, H, opts));
}

function buildTrace(points, W, H, { valueKey = 'cost', secondKey = 'totalTokens', animate = true } = {}) {
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const maxA = niceMax(Math.max(...points.map((p) => p[valueKey] || 0)));
  const maxB = niceMax(Math.max(...points.map((p) => p[secondKey] || 0)));
  const x = (i) => PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yA = (v) => PAD.top + innerH - (v / maxA) * innerH;
  const yB = (v) => PAD.top + innerH - (v / maxB) * innerH;

  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': 'Spend and token volume over time' });

  const grid = svg('g', { class: 'axis' });
  for (let g = 0; g <= 3; g++) {
    const v = (maxA / 3) * g;
    const yy = yA(v);
    grid.append(svg('line', { x1: PAD.left, x2: W - PAD.right, y1: yy, y2: yy }));
    grid.append(svg('text', { x: PAD.left - 7, y: yy + 3, 'text-anchor': 'end' }, money(v)));
  }
  root.append(grid);

  const areaPath = `M${x(0)},${yA(points[0]?.[valueKey] || 0)} ` +
    points.map((p, i) => `L${x(i)},${yA(p[valueKey] || 0)}`).join(' ') +
    ` L${x(points.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`;
  const linePath = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${yA(p[valueKey] || 0)}`).join(' ');
  const tokenPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${yB(p[secondKey] || 0)}`).join(' ');

  const gradId = `grad-${Math.random().toString(36).slice(2, 8)}`;
  const defs = svg('defs');
  const lg = svg('linearGradient', { id: gradId, x1: 0, y1: 0, x2: 0, y2: 1 });
  lg.append(svg('stop', { offset: '0%', 'stop-color': 'var(--sand)', 'stop-opacity': .32 }));
  lg.append(svg('stop', { offset: '100%', 'stop-color': 'var(--sand)', 'stop-opacity': 0 }));
  defs.append(lg);
  root.append(defs);

  root.append(svg('path', { d: areaPath, fill: `url(#${gradId})`, stroke: 'none' }));
  root.append(svg('path', {
    d: tokenPath, fill: 'none', stroke: 'var(--signal)', 'stroke-width': 1.25,
    'stroke-dasharray': '3 3', opacity: .7, 'vector-effect': 'non-scaling-stroke',
  }));
  const line = svg('path', {
    d: linePath, fill: 'none', stroke: 'var(--sand)', 'stroke-width': 1.9,
    'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke',
    class: animate ? 'draw-in' : '',
  });
  root.append(line);
  if (animate) requestAnimationFrame(() => {
    try { line.style.setProperty('--len', line.getTotalLength()); } catch {}
  });

  // hover readout
  const hover = svg('g', { opacity: 0 });
  const vline = svg('line', { y1: PAD.top, y2: PAD.top + innerH, stroke: 'var(--line)' });
  const dot = svg('circle', { r: 3.2, fill: 'var(--sand)' });
  hover.append(vline, dot);
  root.append(hover);

  const labels = svg('g', { class: 'axis' });
  const step = Math.max(1, Math.floor(points.length / 7));
  const lastIndex = points.length - 1;
  points.forEach((p, i) => {
    if (i % step && i !== lastIndex) return;
    if (i !== lastIndex && lastIndex - i < step * 0.6) return;   // avoid colliding with the final label
    labels.append(svg('text', {
      x: x(i), y: H - 6,
      'text-anchor': i === lastIndex ? 'end' : i === 0 ? 'start' : 'middle',
    }, (p.key || '').slice(5)));
  });
  root.append(labels);

  const readout = el('div', { class: 'panel__note', style: { minHeight: '18px', padding: '2px 18px 10px' } });
  const wrap = el('div', {}, root, readout);

  root.addEventListener('pointermove', (ev) => {
    const box = root.getBoundingClientRect();
    const rel = ((ev.clientX - box.left) / box.width) * W;
    const i = Math.max(0, Math.min(points.length - 1, Math.round(((rel - PAD.left) / innerW) * (points.length - 1))));
    const p = points[i];
    if (!p) return;
    hover.setAttribute('opacity', 1);
    vline.setAttribute('x1', x(i)); vline.setAttribute('x2', x(i));
    dot.setAttribute('cx', x(i)); dot.setAttribute('cy', yA(p[valueKey] || 0));
    readout.textContent = `${p.key} — ${money(p.cost)}, ${tokens(p.totalTokens)} tokens, ${count(p.sessions)} session${p.sessions === 1 ? '' : 's'}`;
  });
  root.addEventListener('pointerleave', () => { hover.setAttribute('opacity', 0); readout.textContent = ''; });

  return wrap;
}

/** Horizontal bars, used wherever a ranking needs to be read quickly. */
export function barList(rows, { valueKey = 'cost', labelKey = 'key', format = money, colour = 'var(--sand)', max: forcedMax } = {}) {
  const max = forcedMax || Math.max(1, ...rows.map((r) => r[valueKey] || 0));
  return el('div', { style: { display: 'grid', gap: '9px' } },
    rows.map((r) => el('div', { style: { display: 'grid', gridTemplateColumns: '1fr 120px 72px', alignItems: 'center', gap: '12px' } },
      el('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }, title: String(r[labelKey]) }, String(r[labelKey]).replace(/^\//, '')),
      el('span', { class: 'bar-cell__track' }, el('i', { class: 'bar-cell__fill', style: { width: `${Math.max(2, ((r[valueKey] || 0) / max) * 100)}%`, background: colour } })),
      el('span', { class: 'num', style: { textAlign: 'right', color: 'var(--text-2)', fontSize: '12px' } }, format(r[valueKey] || 0))
    ))
  );
}

/** Donut for a share-of-total breakdown, with a keyed legend beneath. */
export function donut(slices, { size = 168, thickness = 22, format = money } = {}) {
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': 'Share of total' });
  let offset = 0;
  for (const s of slices) {
    const frac = s.value / total;
    root.append(svg('circle', {
      cx: c, cy: c, r, fill: 'none', stroke: s.colour, 'stroke-width': thickness,
      'stroke-dasharray': `${frac * circumference} ${circumference}`,
      'stroke-dashoffset': -offset * circumference,
      transform: `rotate(-90 ${c} ${c})`,
    }));
    offset += frac;
  }
  root.append(svg('text', { x: c, y: c - 2, 'text-anchor': 'middle', style: 'font-size:15px;fill:var(--text)' }, format(total)));
  root.append(svg('text', { x: c, y: c + 13, 'text-anchor': 'middle', style: 'font-size:9.5px;fill:var(--text-3)' }, 'total'));

  const legend = el('div', { class: 'legend' }, slices.map((s) => el('div', { class: 'legend__item' },
    el('i', { class: 'legend__swatch', style: { background: s.colour } }),
    el('span', {}, s.label),
    el('span', { class: 'legend__value num' }, format(s.value))
  )));

  return el('div', { style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' } }, root, legend);
}

/** Vertical columns — used for the hour-of-day distribution. */
export function columns(rows, opts = {}) {
  return responsive(opts.height || 130, (W, H) => buildColumns(rows, W, H, opts));
}

function buildColumns(rows, W, H, { valueKey = 'sessions', labelKey = 'hour', colour = 'var(--signal)' } = {}) {
  const max = Math.max(1, ...rows.map((r) => r[valueKey] || 0));
  const bw = W / rows.length;
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img', 'aria-label': 'Distribution by hour of day' });
  rows.forEach((r, i) => {
    const h = ((r[valueKey] || 0) / max) * (H - 20);
    root.append(svg('rect', {
      class: 'bar', x: i * bw + bw * .18, y: H - 18 - h, width: bw * .64, height: Math.max(h, 1),
      rx: 2, fill: colour, opacity: .85,
    }, svg('title', {}, `${String(r[labelKey]).padStart(2, '0')}:00 — ${r[valueKey]}`)));
    if (i % 3 === 0) root.append(svg('text', { x: i * bw + bw / 2, y: H - 4, 'text-anchor': 'middle' }, String(r[labelKey]).padStart(2, '0')));
  });
  return root;
}

/** Activity heatmap: one column per week, one row per weekday. */
export function heatmapGrid(cells) {
  const values = cells.map((c) => c.sessions).filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p) => values.length ? values[Math.min(values.length - 1, Math.floor(values.length * p))] : 0;
  const breaks = [q(0.25), q(0.5), q(0.75)];
  const level = (v) => (v === 0 ? 0 : v <= breaks[0] ? 1 : v <= breaks[1] ? 2 : v <= breaks[2] ? 3 : 4);

  const grid = el('div', { class: 'heat', role: 'img', 'aria-label': 'Daily activity over the last six months' });
  // pad so the first column starts on the right weekday
  const firstWeekday = cells[0] ? new Date(cells[0].date).getUTCDay() : 0;
  for (let i = 0; i < firstWeekday; i++) grid.append(el('div', { class: 'heat__cell', style: { visibility: 'hidden' } }));
  for (const c of cells) {
    grid.append(el('div', {
      class: 'heat__cell',
      dataset: { level: level(c.sessions) },
      title: `${c.date} — ${c.sessions} session${c.sessions === 1 ? '' : 's'}, ${money(c.cost)}`,
    }));
  }
  const legend = el('div', { class: 'heat-legend', style: { marginTop: '10px' } },
    el('span', {}, 'less'),
    [0, 1, 2, 3, 4].map((l) => el('i', { class: 'heat__cell', dataset: { level: l } })),
    el('span', {}, 'more')
  );
  return el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, el('div', { class: 'scroll-x' }, grid), legend);
}

/** Inline sparkline for table rows and tiles. */
export function sparkline(values, { width = 90, height = 22, colour = 'var(--signal)' } = {}) {
  const max = Math.max(1, ...values);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / Math.max(1, values.length - 1)) * width},${height - (v / max) * (height - 2) - 1}`).join(' ');
  return svg('svg', { class: 'chart', viewBox: `0 0 ${width} ${height}`, width, height, 'aria-hidden': 'true' },
    svg('path', { d, fill: 'none', stroke: colour, 'stroke-width': 1.4, 'vector-effect': 'non-scaling-stroke' }));
}

/** Stacked bar showing where tokens actually went. */
export function usageBar(usage) {
  const parts = [
    { label: 'cache read', value: usage.cacheRead, colour: 'var(--teal)' },
    { label: 'cache write', value: usage.cacheWrite, colour: 'var(--teal-dim)' },
    { label: 'input', value: usage.input, colour: 'var(--signal)' },
    { label: 'output', value: usage.output, colour: 'var(--violet)' },
  ].filter((p) => p.value > 0);
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  return el('div', {},
    el('div', { style: { display: 'flex', height: '9px', borderRadius: '5px', overflow: 'hidden', background: 'var(--ink-400)' } },
      parts.map((p) => el('i', { style: { width: `${(p.value / total) * 100}%`, background: p.colour }, title: `${p.label}: ${tokens(p.value)}` }))),
    el('div', { class: 'legend' }, parts.map((p) => el('div', { class: 'legend__item' },
      el('i', { class: 'legend__swatch', style: { background: p.colour } }),
      el('span', {}, p.label),
      el('span', { class: 'legend__value num' }, tokens(p.value))
    )))
  );
}
