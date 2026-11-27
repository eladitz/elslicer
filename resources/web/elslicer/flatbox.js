// Box Maker's flat boxes: thick panels printed flat and folded up, so no outside face shows layer lines. Panels
// that fold against each other are joined by a thin skin under a V groove (the groove's sides meet when folded);
// the seams that aren't hinged are mitred or cut into fingers. A pattern can run across the whole net, raised on the
// top face or set into the plate face in a second filament.
//
// Coordinates are mm, z up, as printed. The net lies flat; fold() gives where each point goes when folded.
'use strict';

const FlatBox = (() => {
  const TAU = 2 * Math.PI, E = 0.05;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]], sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1];
  const len = a => Math.hypot(a[0], a[1]), unit = a => mul(a, 1 / len(a)), left = d => [-d[1], d[0]];
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;

  // Patterns: a phase whose whole numbers are ridge lines, from a point relative to the floor's centre.
  const PATTERNS = {
    swirl: (x, y, P) => { const r = Math.hypot(x, y); return r / P + 0.55 * Math.sin(3 * Math.atan2(y, x) + r / (2.4 * P)); },
    waves: (x, y, P) => (y + 0.8 * P * Math.sin(x / (1.3 * P))) / P,
    rings: (x, y, P) => Math.hypot(x, y) / P,
    lines: (x, y, P) => (x + y) / Math.SQRT2 / P,
  };

  // The floor's outline, outside, anticlockwise, with edge 0 along the bottom.
  function floorOutline(q, grow = 0) {
    let v;
    if (q.shape === 'rect') { const a = q.length / 2, b = q.width / 2; v = [[-a, -b], [a, -b], [a, b], [-a, b]]; }
    else {
      const n = q.sides, R = q.side / (2 * Math.sin(Math.PI / n)), a0 = -Math.PI / 2 - Math.PI / n;
      v = Array.from({length: n}, (_, k) => [R * Math.cos(a0 + k * TAU / n), R * Math.sin(a0 + k * TAU / n)]);
    }
    return grow ? inset(v, v.map(() => -grow)) : v;
  }

  // The polygon with edge k moved in by offs[k]: each corner where its two edges' moved lines cross.
  function inset(v, offs) {
    const n = v.length, out = [];
    for (let k = 0; k < n; ++k) {
      const j = (k + n - 1) % n;
      const n0 = left(unit(sub(v[k], v[j]))), n1 = left(unit(sub(v[(k + 1) % n], v[k])));
      // dot(P - v[k], n0) = offs[j], dot(P - v[k], n1) = offs[k].
      const det = n0[0] * n1[1] - n0[1] * n1[0];
      const x = (offs[j] * n1[1] - offs[k] * n0[1]) / det, y = (n0[0] * offs[k] - n1[0] * offs[j]) / det;
      out.push(add(v[k], [x, y]));
    }
    return out;
  }

  // The turn at corner k from edge k-1 to edge k: the angle a seam or hinge there folds through.
  const turn = (v, k) => {
    const n = v.length, a = unit(sub(v[k], v[(k + n - 1) % n])), b = unit(sub(v[(k + 1) % n], v[k]));
    return Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  };

  // Finger tabs along an edge of the given length: an odd count, so both ends match; phase 0 has tabs at the ends.
  function tabs(length, fw, phase) {
    const n = Math.max(3, 2 * Math.round((length / fw - 1) / 2) + 1), w = length / n, out = [];
    for (let k = 0; k < n; ++k) if ((k % 2 === 0) !== !!phase) out.push([k * w, (k + 1) * w]);
    return out;
  }

  // A rectangular panel: corner o, along U for w and V for h. sides = {bottom, right, top, left}, each
  // {kind: 'hinge' | 'mitre' | 'fingers' | 'plain', phi (the fold), phase (fingers)}.
  function wallPanel(q, o, U, V, w, h, sides) {
    const T = q.thick, P = (s, t) => add(o, add(mul(U, s), mul(V, t)));
    const edges = [
      {a: o, n: V, ...sides.bottom}, {a: P(0, h), n: mul(V, -1), ...sides.top},
      {a: o, n: U, ...sides.left}, {a: P(w, 0), n: mul(U, -1), ...sides.right},
    ];
    const lo = s => s.kind === 'fingers' ? T : s.kind === 'hinge' ? -E : 0;
    const s0 = lo(sides.left), s1 = w - lo(sides.right), t0 = lo(sides.bottom), t1 = h - lo(sides.top);
    const rect = (a0, a1, b0, b1) => ({c: [P(a0, b0), P(a1, b0), P(a0, b1), P(a1, b1)]});
    const pieces = [rect(s0, s1, t0, t1)];
    const cl = Math.max(0, s0), cr = Math.max(0, w - s1), cb = Math.max(0, t0), ct = Math.max(0, h - t1);
    const band = (side, along, run) => {
      if (side.kind !== 'fingers') return;
      for (const [u0, u1] of tabs(along, q.finger, side.phase)) run(u0, u1);
    };
    band(sides.left, h, (u0, u1) => { const a = Math.max(u0, cb), b = Math.min(u1, h - ct); if (b > a) pieces.push(rect(0, cl + E, a, b)); });
    band(sides.right, h, (u0, u1) => { const a = Math.max(u0, cb), b = Math.min(u1, h - ct); if (b > a) pieces.push(rect(w - cr - E, w, a, b)); });
    band(sides.bottom, w, (u0, u1) => { const a = Math.max(u0, cl), b = Math.min(u1, w - cr); if (b > a) pieces.push(rect(a, b, 0, cb + E)); });
    band(sides.top, w, (u0, u1) => { const a = Math.max(u0, cl), b = Math.min(u1, w - cr); if (b > a) pieces.push(rect(a, b, h - ct - E, h)); });
    // A corner cut on both sides belongs to this panel when both its edges end in a tab.
    const ends = s => s.kind === 'fingers' && !s.phase;
    if (cl && cb && ends(sides.left) && ends(sides.bottom)) pieces.push(rect(0, cl + E, 0, cb + E));
    if (cr && cb && ends(sides.right) && ends(sides.bottom)) pieces.push(rect(w - cr - E, w, 0, cb + E));
    if (cl && ct && ends(sides.left) && ends(sides.top)) pieces.push(rect(0, cl + E, h - ct - E, h));
    if (cr && ct && ends(sides.right) && ends(sides.top)) pieces.push(rect(w - cr - E, w, h - ct - E, h));
    return {edges, pieces};
  }

  // The floor: a convex polygon (anticlockwise), specs[k] for edge k from v[k] to v[k + 1].
  function floorPanel(q, v, specs) {
    const T = q.thick, n = v.length, edges = [], pieces = [];
    for (let k = 0; k < n; ++k) edges.push({a: v[k], n: left(unit(sub(v[(k + 1) % n], v[k]))), ...specs[k]});
    const core = inset(v, specs.map(s => s.kind === 'fingers' ? T : s.kind === 'hinge' ? -E : 0));
    pieces.push({fan: core});
    for (let k = 0; k < n; ++k) {
      const s = specs[k];
      if (s.kind !== 'fingers') continue;
      const A = v[k], B = v[(k + 1) % n], e = unit(sub(B, A)), nin = edges[k].n, L = len(sub(B, A));
      const u0 = dot(sub(core[k], A), e), u1 = dot(sub(core[(k + 1) % n], A), e);
      for (const [a0, a1] of tabs(L, q.finger, s.phase)) {
        const a = Math.max(a0, u0), b = Math.min(a1, u1);
        if (b <= a) continue;
        const p = add(A, mul(e, a)), r = add(A, mul(e, b)), d = mul(nin, T + E);
        pieces.push({c: [p, r, add(p, d), add(r, d)]});
      }
      // The corner at v[k], between the tabs of edges k - 1 and k.
      const j = (k + n - 1) % n, sj = specs[j];
      if (sj.kind === 'fingers' && !sj.phase && !s.phase) {
        const Aj = v[j], ej = unit(sub(A, Aj)), uj = dot(sub(core[k], Aj), ej);
        pieces.push({c: [A, add(A, mul(e, u0)), add(Aj, mul(ej, uj)), core[k]]});
      }
    }
    return {edges, pieces};
  }

  // The net: the floor and its walls, each panel with how it folds onto its parent.
  // 'petals': a wall hinged to every edge of the floor, with the walls' upright edges as seams.
  // 'strip': the walls hinged to each other in a row, one of them hinged to the floor; seams round the floor.
  function net(q, v, H) {
    const n = v.length, right = Math.PI / 2;
    const seam = (phi, phase) => q.joint === 'fingers' && Math.abs(phi - right) < 1e-6 ? {kind: 'fingers', phi, phase} : {kind: 'mitre', phi};
    const plain = {kind: 'plain'}, panels = [];
    if (q.layout === 'petals') {
      const floor = floorPanel(q, v, v.map(() => ({kind: 'hinge', phi: right})));
      panels.push(floor);
      for (let k = 0; k < n; ++k) {
        const A = v[k], B = v[(k + 1) % n], U = unit(sub(B, A)), V = mul(left(U), -1), w = len(sub(B, A));
        // Fingers alternate round the box; only square corners take them, so there are always four walls.
        const ph = k % 2;
        const wall = wallPanel(q, A, U, V, w, H, {bottom: {kind: 'hinge', phi: right}, top: plain,
          left: seam(turn(v, k), ph), right: seam(turn(v, (k + 1) % n), ph)});
        wall.fold = {A, d: U, n: V, phi: right, parent: floor};
        panels.push(wall);
      }
      return panels;
    }
    // Strip, left to right: walls K .. 1, 0, n - 1 .. K + 1, wall 0 hinged to the floor below it.
    const K = Math.floor((n - 1) / 2), order = [];
    for (let k = K; k >= 1; --k) order.push(k);
    order.push(0);
    for (let k = n - 1; k > K; --k) order.push(k);
    const width = k => len(sub(v[(k + 1) % n], v[k]));
    let x = 0;
    const at = order.map(k => { const x0 = x; x += width(k); return x0; });
    const i0 = order.indexOf(0), x0 = at[i0], w0 = width(0);
    // The floor turned so its edge 0 is wall 0's bottom, the floor below.
    const a0 = Math.atan2(v[1][1] - v[0][1], v[1][0] - v[0][0]), b = Math.PI - a0, c = Math.cos(b), s = Math.sin(b);
    const placed = v.map(p => { const d = sub(p, v[0]); return [x0 + w0 + c * d[0] - s * d[1], s * d[0] + c * d[1]]; });
    const floor = floorPanel(q, placed, v.map((_, k) => k === 0 ? {kind: 'hinge', phi: right} : seam(right, 0)));
    panels.push(floor);
    const walls = [];
    order.forEach((k, i) => {
      // Wall k's left end meets wall k + 1 at corner k + 1, its right end wall k - 1 at corner k.
      const cornerL = (k + 1) % n, cornerR = k;
      const lside = i === 0 ? seam(turn(v, cornerL), 0) : {kind: 'hinge', phi: turn(v, cornerL)};
      const rside = i === order.length - 1 ? seam(turn(v, cornerR), 1) : {kind: 'hinge', phi: turn(v, cornerR)};
      const wall = wallPanel(q, [at[i], 0], [1, 0], [0, 1], width(k), H,
        {bottom: k === 0 ? {kind: 'hinge', phi: right} : seam(right, 1), top: plain, left: lside, right: rside});
      walls.push(wall);
    });
    walls[i0].fold = {A: [x0, 0], d: [1, 0], n: [0, 1], phi: right, parent: floor};
    for (let i = i0 - 1; i >= 0; --i) walls[i].fold = {A: [at[i + 1], 0], d: [0, 1], n: [-1, 0], phi: walls[i].edges[3].phi, parent: walls[i + 1]};
    for (let i = i0 + 1; i < walls.length; ++i) walls[i].fold = {A: [at[i], 0], d: [0, 1], n: [1, 0], phi: walls[i].edges[2].phi, parent: walls[i - 1]};
    return panels.concat(walls);
  }

  // The panel's faces at a point: [bottom, top] of the body, and the top of the second-filament inlay.
  function faces(q, panel, pattern, x, y) {
    const T = q.thick, h = q.hinge;
    let r = 0, mask = 1;
    for (const e of panel.edges) {
      if (e.kind !== 'hinge' && e.kind !== 'mitre') continue;
      const d = Math.max(0, (x - e.a[0]) * e.n[0] + (y - e.a[1]) * e.n[1]), tan = Math.tan(e.phi / 2);
      const deep = e.kind === 'hinge' ? T - h : T;
      r = Math.max(r, deep - d / tan);
      // Keep the pattern off the folds, so the hinges bend and the mitres meet cleanly.
      mask = Math.min(mask, clamp01((d - deep * tan - 0.3) / 0.8));
    }
    const pat = pattern ? pattern(x, y) * mask : 0;
    if (q.outside === 'top') return [r, T + q.relief * pat, 0];
    const top = T - r;
    return [0, top, Math.min(q.inlay, top) * pat];
  }

  // A ridge profile from a phase: 1 on the ridges, 0 between, with sloping sides.
  function ridges(q, centre) {
    const f = PATTERNS[q.pattern];
    if (!f) return null;
    const P = q.period, duty = 0.45, soft = Math.max(0.3, q.outside === 'top' ? q.relief : 0.4) / P;
    return (x, y) => {
      const ph = f(x - centre[0], y - centre[1], P), fr = ph - Math.floor(ph);
      return clamp01((duty / 2 - Math.abs(fr - 0.5)) / soft + 0.5);
    };
  }

  // The sheets for each panel's pieces: what solid lies between the two faces, at every grid point.
  function sheets(q, panels, pattern, which) {
    const out = [], res = q.res;
    for (const panel of panels)
      for (const pc of panel.pieces) {
        let nu, nv, at, wrap = false;
        if (pc.fan) {
          const ring = [], core = pc.fan, n = core.length;
          const cx = core.reduce((a, p) => a + p[0], 0) / n, cy = core.reduce((a, p) => a + p[1], 0) / n;
          // Clockwise round the edge, so the sheet's front is its top.
          for (let k = n; k > 0; --k) {
            const A = core[k % n], B = core[k - 1], m = Math.max(1, Math.ceil(len(sub(B, A)) / res));
            for (let i = 0; i < m; ++i) ring.push(add(A, mul(sub(B, A), i / m)));
          }
          const R = Math.max(...ring.map(p => Math.hypot(p[0] - cx, p[1] - cy)));
          nu = ring.length; nv = Math.max(2, Math.ceil(R / res) + 1); wrap = true;
          at = (i, j) => { const t = j / (nv - 1); return [cx + t * (ring[i][0] - cx), cy + t * (ring[i][1] - cy)]; };
        } else {
          const [p00, p10, p01, p11] = pc.c;
          nu = Math.max(2, Math.ceil(Math.max(len(sub(p10, p00)), len(sub(p11, p01))) / res) + 1);
          nv = Math.max(2, Math.ceil(Math.max(len(sub(p01, p00)), len(sub(p11, p10))) / res) + 1);
          at = (i, j) => { const u = i / (nu - 1), w = j / (nv - 1);
            return [(1 - u) * (1 - w) * p00[0] + u * (1 - w) * p10[0] + (1 - u) * w * p01[0] + u * w * p11[0],
                    (1 - u) * (1 - w) * p00[1] + u * (1 - w) * p10[1] + (1 - u) * w * p01[1] + u * w * p11[1]]; };
          const a = sub(p10, p00), b = sub(p01, p00);
          if (a[0] * b[1] - a[1] * b[0] < 0) { const old = at; at = (i, j) => old(nu - 1 - i, j); }
        }
        const cache = new Array(nu * nv);
        const s = Lamp.sheet(nu, nv, wrap, (i, j, front) => {
          const k = j * nu + i;
          if (!cache[k]) {
            const [x, y] = at(i, j), f = faces(q, panel, pattern, x, y);
            let z0, z1;
            if (which === 'inlay') { z0 = 0; z1 = f[2]; } else { z0 = f[0]; z1 = f[1]; }
            if (z1 - z0 < 0.02) z1 = z0;
            cache[k] = [x, y, z0, z1];
          }
          const c = cache[k];
          return [c[0], c[1], front ? c[3] : c[2]];
        });
        s.panel = panel;
        out.push(s);
      }
    return out;
  }

  // Where a point of the net goes once every panel is folded, the floor staying put: a turn about each hinge
  // in turn, from the panel's own up to the floor's. The hinges are on the outside face.
  function folder(q) {
    const zh = q.outside === 'top' ? q.thick : 0, up = q.outside === 'top' ? -1 : 1;
    const turnAbout = (f, p) => {
      const cz = f.d[0] * f.n[1] - f.d[1] * f.n[0], th = Math.sign(cz) * f.phi * up, c = Math.cos(th), s = Math.sin(th);
      const v = [p[0] - f.A[0], p[1] - f.A[1], p[2] - zh], d = [f.d[0], f.d[1], 0];
      const cr = [d[1] * v[2] - d[2] * v[1], d[2] * v[0] - d[0] * v[2], d[0] * v[1] - d[1] * v[0]];
      const dv = d[0] * v[0] + d[1] * v[1];
      return [f.A[0] + v[0] * c + cr[0] * s + d[0] * dv * (1 - c), f.A[1] + v[1] * c + cr[1] * s + d[1] * dv * (1 - c), zh + v[2] * c + cr[2] * s];
    };
    return (panel, p) => { for (let at = panel; at && at.fold; at = at.fold.parent) p = turnAbout(at.fold, p); return p; };
  }

  function foldSheets(q, list, centre, lift = 0) {
    const go = folder(q), flip = q.outside === 'top';
    return list.map(s => {
      const pos = new Float32Array(s.pos.length);
      for (let k = 0; k < s.pos.length; k += 3) {
        let p = go(s.panel, [s.pos[k], s.pos[k + 1], s.pos[k + 2]]);
        if (flip) p = [p[0], 2 * centre[1] - p[1], q.thick - p[2]];
        pos[k] = p[0]; pos[k + 1] = p[1]; pos[k + 2] = p[2] + lift;
      }
      return {...s, pos};
    });
  }

  // Everything for one box: q is the flat settings.
  function build(q) {
    const problems = [], notes = [], T = q.thick;
    if (q.hinge >= T - 0.2) problems.push('The fold skin must be thinner than the panels, or it won\'t bend.');
    if (q.height < 2 * T + 6) problems.push('Make it taller: the walls need room above the floor.');
    const v = floorOutline(q);
    const minEdge = Math.min(...v.map((p, k) => len(sub(v[(k + 1) % v.length], p))));
    if (minEdge < 4 * T + 6) problems.push('A side is too short for its thickness: make it bigger or the panels thinner.');
    const parts = (outline, H) => {
      const panels = net(q, outline, H), floor = panels[0];
      const c = floor.pieces[0].fan, centre = [c.reduce((a, p) => a + p[0], 0) / c.length, c.reduce((a, p) => a + p[1], 0) / c.length];
      const pattern = ridges(q, centre);
      return {panels, centre, body: sheets(q, panels, pattern, 'body'),
              inlay: pattern && q.outside === 'bed' ? sheets(q, panels, pattern, 'inlay') : []};
    };
    const box = parts(v, q.height);
    const lid = q.lid === 'liftoff' ? parts(floorOutline(q, T + q.fit), q.lidDepth) : null;

    // Seams and folds that fold far: their bevels overhang when they face the plate.
    const steep = box.panels.some(p => p.edges.some(e => (e.kind === 'hinge' || e.kind === 'mitre') && e.phi / 2 > 0.88));
    if (steep && q.outside === 'top') notes.push('The corners fold so far that their grooves, printed facing the plate, overhang steeply: put the smooth face on the plate instead.');
    if (q.joint === 'fingers' && box.panels.some(p => p.edges.some(e => e.kind === 'mitre')))
      notes.push('Fingers only fit square corners, so the angled seams are mitred: glue those.');
    return {box, lid, problems, notes};
  }

  return {build, foldSheets, PATTERNS};
})();
