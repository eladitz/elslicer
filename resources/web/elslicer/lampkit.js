// Shared by the Lampshade and Lithophane makers: closed sheets of triangles, the mount that holds a shade on a
// lamp holder, a WebGL preview, and the message that hands the meshes to the app.
//
// Every solid here is a sheet: a grid of nu by nv points, each with a front and a back position, closed along its
// edges (and joined round when it wraps). The app builds the same triangles from the same grid, so what is
// previewed is what is added. Coordinates are mm, z up, as printed: the bed is z = 0.
'use strict';

const Lamp = (() => {
  // Triangles of a sheet. Front vertex (i, j) is j * nu + i, back is nu * nv + j * nu + i. Must match
  // sheet_indices() in ElslicerDialogs.cpp.
  function sheetIndices(nu, nv, wrap) {
    const F = (i, j) => j * nu + i, B = (i, j) => nu * nv + j * nu + i;
    const cols = wrap ? nu : nu - 1, out = [];
    for (let j = 0; j + 1 < nv; ++j)
      for (let i = 0; i < cols; ++i) {
        const k = (i + 1) % nu;
        out.push(F(i, j), F(k, j), F(k, j + 1), F(i, j), F(k, j + 1), F(i, j + 1));
        out.push(B(i, j), B(k, j + 1), B(k, j), B(i, j), B(i, j + 1), B(k, j + 1));
      }
    const t = nv - 1;
    for (let i = 0; i < cols; ++i) {
      const k = (i + 1) % nu;
      out.push(F(k, 0), F(i, 0), B(i, 0), F(k, 0), B(i, 0), B(k, 0));
      out.push(F(i, t), F(k, t), B(k, t), F(i, t), B(k, t), B(i, t));
    }
    if (!wrap) {
      const r = nu - 1;
      for (let j = 0; j + 1 < nv; ++j) {
        out.push(F(0, j), F(0, j + 1), B(0, j + 1), F(0, j), B(0, j + 1), B(0, j));
        out.push(F(r, j + 1), F(r, j), B(r, j), F(r, j + 1), B(r, j), B(r, j + 1));
      }
    }
    return new Uint32Array(out);
  }

  // A sheet from a function giving the front or back point at grid (i, j).
  function sheet(nu, nv, wrap, at) {
    const pos = new Float32Array(2 * nu * nv * 3);
    for (let side = 0; side < 2; ++side)
      for (let j = 0; j < nv; ++j)
        for (let i = 0; i < nu; ++i) {
          const p = at(i, j, side === 0), o = 3 * (side * nu * nv + j * nu + i);
          pos[o] = p[0]; pos[o + 1] = p[1]; pos[o + 2] = p[2];
        }
    return {nu, nv, wrap, pos};
  }

  // How thick the sheet is at each grid point: from the front point to the back one.
  function thickness(s) {
    const n = s.nu * s.nv, out = new Float32Array(n);
    for (let k = 0; k < n; ++k) {
      const a = 3 * k, b = 3 * (n + k);
      out[k] = Math.hypot(s.pos[a] - s.pos[b], s.pos[a + 1] - s.pos[b + 1], s.pos[a + 2] - s.pos[b + 2]);
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------------------
  // Mounts. Hole sizes are the threaded sleeve the shade ring screws onto, with a little room; worth measuring.
  const FIXTURES = {
    e27:    {name: 'E27 holder with shade ring', hole: 40.5, hint: 'The ring screws onto the holder and clamps the shade. Most European pendants and table lamps.'},
    e14:    {name: 'E14 holder with shade ring', hole: 28.5, hint: 'The small candle-bulb holder, with its shade ring.'},
    harp:   {name: 'Harp and finial', hole: 7.5, hub: true, hint: 'US table lamps: the shade rests on the harp and the finial screws down on it.'},
    socket: {name: 'Rests over a socket', hole: 42, hint: 'The shade sits over the socket on a lamp base, held by its own weight.'},
    custom: {name: 'Custom hole', hole: 40, hint: 'Measure the part the shade clamps onto, and add half a millimetre.'},
    none:   {name: 'No mount', hole: 0, hint: 'Just the shade, for a frame or fitting you already have.'},
  };

  // A ring between two radii, which may change around it, from z0 to z1.
  function ring(r0, r1, z0, z1, segs) {
    return sheet(segs, 2, true, (i, j, front) => {
      const a = 2 * Math.PI * i / segs, r = j === 0 ? r0(a) : r1(a);
      return [r * Math.cos(a), r * Math.sin(a), front ? z1 : z0];
    });
  }

  // A flat bar out from the centre at angle a, from radius r0 to r1, w wide.
  function spoke(a, r0, r1, w, z0, z1) {
    const c = Math.cos(a), s = Math.sin(a);
    return sheet(2, 2, false, (i, j, front) => {
      const x = j === 0 ? r0 : r1, y = i === 0 ? -w / 2 : w / 2;
      return [x * c - y * s, x * s + y * c, front ? z1 : z0];
    });
  }

  // The mount at the bed end of a shade: a hub around the hole, joined to the wall by spokes, or a flat flange when
  // there is little room between them. wallIn(a) is the shade's inside radius at angle a at z = 0, and grip how far
  // into the wall to reach. Gives the sheets, or a problem.
  function mount(fixture, hole, wallIn, grip, thick = 3, spokes = 3) {
    const f = FIXTURES[fixture];
    if (!f || fixture === 'none') return {sheets: []};
    const r = hole / 2, hub = f.hub ? 12 : 7, segs = 180;
    let least = Infinity;
    for (let i = 0; i < 360; ++i) least = Math.min(least, wallIn(2 * Math.PI * i / 360));
    if (least < r + 3) return {problem: `The opening at the mount is ${(2 * least).toFixed(0)} mm across, too small for a ${hole.toFixed(1)} mm hole.`};
    if (least - (r + hub) < 10)
      return {sheets: [ring(() => r, a => wallIn(a) + grip, 0, thick, segs)], kind: 'flange'};
    const sheets = [ring(() => r, () => r + hub, 0, thick, segs)];
    for (let k = 0; k < spokes; ++k) {
      const a = 2 * Math.PI * (k + 0.25) / spokes;
      sheets.push(spoke(a, r + hub - 1, wallIn(a) + grip, 7, 0, thick));
    }
    return {sheets, kind: 'spokes'};
  }

  // A block from x0 to x1, y0 to y1 and z0 to z1.
  function box(x0, x1, y0, y1, z0, z1) {
    return sheet(2, 2, false, (i, j, front) => [i ? x1 : x0, j ? y1 : y0, front ? z1 : z0]);
  }

  // A curved block between radii r0 and r1, from angle a0 to a1, and z0 to z1.
  function arcBlock(r0, r1, a0, a1, z0, z1, segs = 96) {
    return sheet(segs, 2, false, (i, j, front) => {
      const a = a0 + (a1 - a0) * i / (segs - 1), r = j ? r1 : r0;
      return [r * Math.cos(a), r * Math.sin(a), front ? z1 : z0];
    });
  }

  // The sheets moved by (dx, dy, dz), as new sheets.
  function moved(sheets, dx, dy = 0, dz = 0) {
    return sheets.map(s => {
      const pos = new Float32Array(s.pos);
      for (let k = 0; k < pos.length; k += 3) { pos[k] += dx; pos[k + 1] += dy; pos[k + 2] += dz; }
      return {...s, pos};
    });
  }

  // How far the solid parts of the sheets reach: [[min x, y, z], [max x, y, z]].
  function bounds(sheets) {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const s of sheets) {
      const half = 3 * s.nu * s.nv;
      for (let k = 0; k < s.pos.length; k += 3) {
        // Points with no thickness under them aren't part of the solid.
        const w = k < half ? k + half : k - half;
        if (s.pos[k] === s.pos[w] && s.pos[k + 1] === s.pos[w + 1] && s.pos[k + 2] === s.pos[w + 2]) continue;
        for (let a = 0; a < 3; ++a) { lo[a] = Math.min(lo[a], s.pos[k + a]); hi[a] = Math.max(hi[a], s.pos[k + a]); }
      }
    }
    return [lo, hi];
  }

  // ---------------------------------------------------------------------------------------------------------
  // The message adding the parts to the plate: [{name, sheets}], each sheet's points as base64 float32.
  function base64(floats) {
    const bytes = new Uint8Array(floats.buffer, floats.byteOffset, floats.byteLength);
    let text = '';
    for (let k = 0; k < bytes.length; k += 0x8000) text += String.fromCharCode.apply(null, bytes.subarray(k, k + 0x8000));
    return btoa(text);
  }
  const partsJson = parts => parts.filter(p => p.sheets.length).map(p => ({
    name: p.name, ...(p.extruder ? {extruder: p.extruder} : {}), sheets: p.sheets.map(s => ({nu: s.nu, nv: s.nv, wrap: s.wrap, pos: base64(s.pos)}))}));
  // One object of parts, and any more objects as [{name, parts}], each added beside the last.
  function addMessage(name, parts, more = []) {
    return {cmd: 'add', objects: [{name, parts: partsJson(parts)}, ...more.map(o => ({name: o.name, parts: partsJson(o.parts)}))]};
  }

  // ---------------------------------------------------------------------------------------------------------
  // Preview: the sheets lit from the viewer, or glowing as if lit from inside, where thin parts let more through.
  class Viewer {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = this.gl = canvas.getContext('webgl2', {antialias: true});
      this.yaw = -0.6; this.pitch = 0.35; this.zoom = 1; this.parts = [];
      if (!gl) return;
      const shader = (type, text) => { const s = gl.createShader(type); gl.shaderSource(s, text); gl.compileShader(s); return s; };
      const p = this.program = gl.createProgram();
      gl.attachShader(p, shader(gl.VERTEX_SHADER, `#version 300 es
        in vec3 p; in vec3 n; in vec3 c; uniform mat4 m; out vec3 vn; out vec3 vc;
        void main() { gl_Position = m * vec4(p, 1.0); vn = n; vc = c; }`));
      gl.attachShader(p, shader(gl.FRAGMENT_SHADER, `#version 300 es
        precision highp float; in vec3 vn; in vec3 vc; uniform vec3 eye; uniform float glow; out vec4 o;
        void main() {
          float d = abs(dot(normalize(vn), normalize(eye)));
          o = vec4(vc * mix(0.22 + 0.78 * d, 0.75 + 0.25 * d, glow), 1.0);
        }`));
      gl.linkProgram(p);
      let last = null;
      canvas.addEventListener('pointerdown', e => { last = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointerup', () => { last = null; });
      canvas.addEventListener('pointermove', e => {
        if (!last) return;
        this.yaw -= (e.clientX - last[0]) * 0.01;
        this.pitch = Math.max(-1.4, Math.min(1.4, this.pitch + (e.clientY - last[1]) * 0.01));
        last = [e.clientX, e.clientY];
        this.draw();
      });
      canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom = Math.max(0.3, Math.min(4, this.zoom * Math.exp(e.deltaY * 0.001))); this.draw(); }, {passive: false});
      new ResizeObserver(() => this.draw()).observe(canvas);
    }

    // parts: [{sheets, colour: [r, g, b], glow}]. glow: colour each point by how much light gets through its thickness.
    // flip: show it turned over, as it hangs rather than as it prints.
    show(parts, glow, flip) {
      const gl = this.gl;
      if (!gl) return;
      for (const old of this.parts) { gl.deleteVertexArray(old.vao); for (const b of old.buffers) gl.deleteBuffer(b); }
      this.parts = [];
      this.glow = glow ? 1 : 0;
      let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (const part of parts)
        for (const s of part.sheets) {
          const n = s.pos.length / 3, half0 = s.nu * s.nv;
          // Where a sheet has no thickness (the empty parts of a height field) the app adds nothing, so neither does
          // the preview: faces whose every corner sits on its twin on the other face are left out.
          const flat = v => { const w = v < half0 ? v + half0 : v - half0;
            return s.pos[3 * v] === s.pos[3 * w] && s.pos[3 * v + 1] === s.pos[3 * w + 1] && s.pos[3 * v + 2] === s.pos[3 * w + 2]; };
          let idx = sheetIndices(s.nu, s.nv, s.wrap);
          const kept = [];
          for (let k = 0; k < idx.length; k += 3) if (!(flat(idx[k]) && flat(idx[k + 1]) && flat(idx[k + 2]))) kept.push(idx[k], idx[k + 1], idx[k + 2]);
          if (kept.length < idx.length) idx = new Uint32Array(kept);
          let pos = s.pos;
          if (flip) {
            pos = new Float32Array(s.pos);
            for (let k = 0; k < pos.length; k += 3) { pos[k + 1] = -pos[k + 1]; pos[k + 2] = -pos[k + 2]; }
          }
          const nrm = new Float32Array(pos.length), col = new Float32Array(pos.length);
          for (let k = 0; k < idx.length; k += 3) {
            const a = 3 * idx[k], b = 3 * idx[k + 1], c = 3 * idx[k + 2];
            const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
            const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
            const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
            for (const v of [a, b, c]) { nrm[v] += nx; nrm[v + 1] += ny; nrm[v + 2] += nz; }
          }
          // Only parts light shines through glow; mounts and stands stay plain.
          const t = glow && part.glow !== false ? thickness(s) : null, half = s.nu * s.nv;
          let thinnest = Infinity;
          if (t) for (const v of t) thinnest = Math.min(thinnest, v);
          for (let v = 0; v < n; ++v) {
            let r = part.colour[0], g = part.colour[1], b = part.colour[2];
            if (t) {
              const light = 1.15 * Math.exp(-0.9 * Math.max(0, t[v % half] - thinnest));
              r = 1.0 * light + 0.05; g = 0.78 * light + 0.04; b = 0.45 * light + 0.03;
            }
            col[3 * v] = r; col[3 * v + 1] = g; col[3 * v + 2] = b;
            if (!flat(v)) for (let a = 0; a < 3; ++a) { lo[a] = Math.min(lo[a], pos[3 * v + a]); hi[a] = Math.max(hi[a], pos[3 * v + a]); }
          }
          const vao = gl.createVertexArray();
          gl.bindVertexArray(vao);
          const buffers = [];
          for (const [name, data] of [['p', pos], ['n', nrm], ['c', col]]) {
            const buf = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, buf);
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
            const loc = gl.getAttribLocation(this.program, name);
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
            buffers.push(buf);
          }
          const ib = gl.createBuffer();
          gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
          gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
          buffers.push(ib);
          gl.bindVertexArray(null);
          this.parts.push({vao, buffers, count: idx.length});
        }
      if (isFinite(lo[0])) {
        this.centre = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
        this.radius = Math.max(10, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
      }
      this.draw();
    }

    draw() {
      const gl = this.gl, c = this.canvas;
      if (!gl) return;
      const w = Math.max(1, Math.round(c.clientWidth * devicePixelRatio)), h = Math.max(1, Math.round(c.clientHeight * devicePixelRatio));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      gl.viewport(0, 0, w, h);
      gl.clearColor(0.13, 0.135, 0.15, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (!this.parts.length || !this.centre) return;
      gl.enable(gl.DEPTH_TEST);
      const dist = this.radius * 2.6 * this.zoom, cp = Math.cos(this.pitch);
      const eye = [this.centre[0] + dist * cp * Math.cos(this.yaw), this.centre[1] + dist * cp * Math.sin(this.yaw), this.centre[2] + dist * Math.sin(this.pitch)];
      const m = mul(perspective(0.7, w / h, dist / 20, dist * 4), lookAt(eye, this.centre, [0, 0, 1]));
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'm'), false, m);
      gl.uniform3f(gl.getUniformLocation(this.program, 'eye'), eye[0] - this.centre[0], eye[1] - this.centre[1], eye[2] - this.centre[2]);
      gl.uniform1f(gl.getUniformLocation(this.program, 'glow'), this.glow);
      for (const part of this.parts) {
        gl.bindVertexArray(part.vao);
        gl.drawElements(gl.TRIANGLES, part.count, gl.UNSIGNED_INT, 0);
      }
      gl.bindVertexArray(null);
    }
  }

  // Column-major 4x4 matrices.
  function perspective(fov, aspect, near, far) {
    const f = 1 / Math.tan(fov / 2), d = near - far;
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / d, -1, 0, 0, 2 * far * near / d, 0];
  }
  function lookAt(eye, at, up) {
    const z = norm(sub(eye, at)), x = norm(cross(up, z)), y = cross(z, x);
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1];
  }
  function mul(a, b) {
    const o = new Array(16).fill(0);
    for (let c = 0; c < 4; ++c) for (let r = 0; r < 4; ++r) for (let k = 0; k < 4; ++k) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return o;
  }
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

  return {sheet, sheetIndices, thickness, ring, spoke, box, arcBlock, moved, bounds, mount, FIXTURES, addMessage, Viewer};
})();
