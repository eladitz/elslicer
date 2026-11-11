// Settings guide: helpers and drawings shared by every tab's guide.
window.G = (() => {
  const C = {bg: '#121316', line: '#34363c', text: '#ececee', muted: '#a0a2a9', faint: '#5a5c63', accent: '#5b5bd6',
             accent2: '#8f8fe8', warm: '#e0a83c', bad: '#ef6a5f', good: '#4fb37a', plastic: '#5b5bd6', plastic2: '#3f3fa8', bed: '#3a3c42'};

  const num = v => parseFloat(String(v).replace(',', '.'));
  const isPercent = v => String(v).trim().endsWith('%');
  // A length that can be in mm or in % of something (the nozzle, a line width...): in mm.
  const length = (v, of) => isPercent(v) ? num(v) / 100 * of : num(v);
  const on = v => v === '1' || v === 'true' || v === true;
  const round = (v, digits = 2) => +(+v).toFixed(digits);
  const mm = v => `${round(v)} mm`;
  const pct = v => `${Math.round(v)}%`;
  const tallest = ctx => ctx.objects.reduce((best, o) => (!best || o.height > best.height ? o : best), null);
  const layers = (height, first, layer) => height <= first ? 1 : 1 + Math.ceil((height - first) / layer - 1e-9);
  const colour = (ctx, i, fallback) => (ctx.colours && ctx.colours[i]) || fallback;
  const duration = minutes => minutes < 60 ? `${Math.round(minutes)} min` : `${Math.floor(minutes / 60)} h ${String(Math.round(minutes % 60)).padStart(2, '0')} min`;
  const warn = text => `<span class="warning">${text}</span>`;
  const val = (ctx, key) => ctx.values[key];
  const objectName = ctx => { const t = tallest(ctx); return t ? `<b>${t.name}</b>` : 'your object'; };
  // Extra width the printer can't do well: line widths far from the nozzle.
  const widthRisk = (w, n) => w < 0.6 * n ? 'Narrower than 60% of the nozzle: the plastic comes out thin and uneven, and lines can break.' :
    w > 2 * n ? 'Wider than twice the nozzle: the nozzle can\'t press that much plastic flat, so lines come out lumpy and weak.' :
    w > 1.5 * n ? 'Much wider than the nozzle: needs a lot of plastic per second, so keep speeds down.' : '';

  const svg = (w, h, body, caption) => `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, sans-serif" font-size="14">
      <rect width="${w}" height="${h}" fill="${C.bg}"/>${body}</svg>${caption ? `<div class="caption">${caption}</div>` : ''}`;
  const text = (x, y, t, o = {}) => `<text x="${x}" y="${y}" fill="${o.fill || C.muted}" font-size="${o.size || 14}" ${o.anchor ? `text-anchor="${o.anchor}"` : ''} ${o.bold ? 'font-weight="600"' : ''}>${t}</text>`;
  const rect = (x, y, w, h, fill, o = {}) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${o.rx != null ? `rx="${o.rx}"` : ''} ${o.stroke ? `stroke="${o.stroke}" stroke-width="${o.sw || 1}"` : ''} ${o.opacity != null ? `opacity="${o.opacity}"` : ''}/>`;
  const line = (x1, y1, x2, y2, stroke = C.faint, o = {}) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${o.sw || 1}" ${o.dash ? `stroke-dasharray="${o.dash}"` : ''}/>`;
  // A printed line from the end: a flattened oval.
  const bead = (x, y, w, h, fill = C.plastic) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" fill="${fill}" stroke="${C.bg}" stroke-width="1"/>`;

  // Bars to compare a few options on one measure, the chosen one lit.
  function bars(items, o = {}) {
    const W = 760, rowH = 34, H = 30 + items.length * rowH + 10, max = Math.max(...items.map(i => i.value), 1e-9);
    let body = o.title ? text(20, 22, o.title) : '';
    items.forEach((item, i) => {
      const y = 34 + i * rowH, w = Math.max(2, item.value / max * 470);
      body += text(20, y + 17, item.label, {fill: item.lit ? C.text : C.muted, bold: item.lit});
      body += rect(230, y + 2, w, 20, item.lit ? C.accent : C.line, {rx: 3});
      body += text(240 + w, y + 17, item.shown != null ? item.shown : round(item.value), {fill: item.lit ? C.text : C.muted});
    });
    return svg(W, H, body, o.caption);
  }

  // A wall seen in cross-section: the line widths of the outer and inner walls side by side.
  function wallSection(widths, h, o = {}) {
    const W = 760, H = 230, s = Math.min(150, 560 / widths.reduce((a, b) => a + b, 0.001));
    let x = 40, body = text(20, 24, o.title || 'A wall cut through, enlarged: each oval is one line of plastic');
    const rows = 3;
    widths.forEach((w, i) => {
      for (let r = 0; r < rows; ++r)
        body += bead(x, 190 - (r + 1) * h * s, w * s, h * s, o.colours ? o.colours[i] : (i === (o.lit ?? -1) ? C.accent2 : C.plastic));
      if (o.labels) body += text(x + w * s / 2, 214, o.labels[i], {anchor: 'middle', size: 12});
      x += w * s * (o.overlap ? 0.92 : 1);
    });
    body += line(30, 190, x + 20, 190);
    return svg(W, H, body, o.caption);
  }

  return {C, num, isPercent, length, on, round, mm, pct, tallest, layers, colour, duration, warn, val, objectName, widthRisk,
          svg, text, rect, line, bead, bars, wallSection};
})();
