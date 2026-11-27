// QR codes, byte mode, error correction level M, versions 1 to 40, following ISO/IEC 18004 the way Project
// Nayuki's QR Code generator (MIT licence) lays it out. QR.make(text) gives {size, dark(x, y)}, or null when the
// text is too long; x runs right and y down, with no quiet zone.
'use strict';
const QR = (() => {
  const ECC = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
  const BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
  const FORMAT_M = 0;
  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  function rawModules(ver) {
    let n = (16 * ver + 128) * ver + 64;
    if (ver >= 2) { const a = Math.floor(ver / 7) + 2; n -= (25 * a - 10) * a - 55; if (ver >= 7) n -= 36; }
    return n;
  }
  const dataCodewords = ver => Math.floor(rawModules(ver) / 8) - ECC[ver] * BLOCKS[ver];

  function mul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; --i) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z & 0xFF;
  }
  function divisor(degree) {
    const out = new Array(degree).fill(0); out[degree - 1] = 1;
    let root = 1;
    for (let i = 0; i < degree; ++i) {
      for (let j = 0; j < out.length; ++j) { out[j] = mul(out[j], root); if (j + 1 < out.length) out[j] ^= out[j + 1]; }
      root = mul(root, 0x02);
    }
    return out;
  }
  function remainder(data, div) {
    const out = div.map(() => 0);
    for (const b of data) {
      const f = b ^ out.shift(); out.push(0);
      div.forEach((c, i) => { out[i] ^= mul(c, f); });
    }
    return out;
  }

  function make(text) {
    const bytes = Array.from(new TextEncoder().encode(text));
    let ver = 1;
    for (; ver <= 40; ++ver) {
      const countBits = ver <= 9 ? 8 : 16;
      if (4 + countBits + 8 * bytes.length <= dataCodewords(ver) * 8) break;
    }
    if (ver > 40) return null;
    // The data bits, padded to the version's capacity.
    const bits = [], put = (v, n) => { for (let i = n - 1; i >= 0; --i) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, ver <= 9 ? 8 : 16);
    for (const b of bytes) put(b, 8);
    const cap = dataCodewords(ver) * 8;
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
    // Split into blocks, add each block's error correction, and interleave.
    const nb = BLOCKS[ver], el = ECC[ver], raw = Math.floor(rawModules(ver) / 8), nShort = nb - raw % nb, shortLen = Math.floor(raw / nb);
    const div = divisor(el), blocks = [];
    for (let i = 0, k = 0; i < nb; ++i) {
      const dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1));
      k += dat.length;
      const ecc = remainder(dat, div);
      if (i < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    const words = [];
    for (let i = 0; i < blocks[0].length; ++i)
      blocks.forEach((b, j) => { if (i !== shortLen - el || j >= nShort) words.push(b[i]); });

    const size = ver * 4 + 17;
    const mod = Array.from({length: size}, () => new Array(size).fill(false));
    const fn = Array.from({length: size}, () => new Array(size).fill(false));
    const set = (x, y, dark) => { mod[y][x] = dark; fn[y][x] = true; };
    for (let i = 0; i < size; ++i) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (x, y) => { for (let dy = -4; dy <= 4; ++dy) for (let dx = -4; dx <= 4; ++dx) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy;
      if (xx >= 0 && xx < size && yy >= 0 && yy < size) set(xx, yy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    if (ver > 1) {
      const n = Math.floor(ver / 7) + 2, step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2, pos = [6];
      for (let q = size - 7; pos.length < n; q -= step) pos.splice(1, 0, q);
      for (let i = 0; i < n; ++i) for (let j = 0; j < n; ++j) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; ++dy) for (let dx = -2; dx <= 2; ++dx) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    }
    const format = mask => {
      const d = (FORMAT_M << 3) | mask;
      let r = d;
      for (let i = 0; i < 10; ++i) r = (r << 1) ^ ((r >>> 9) * 0x537);
      const b = ((d << 10) | r) ^ 0x5412;
      for (let i = 0; i <= 5; ++i) set(8, i, bit(b, i));
      set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
      for (let i = 9; i < 15; ++i) set(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; ++i) set(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; ++i) set(8, size - 15 + i, bit(b, i));
      set(8, size - 8, true);
    };
    format(0);
    if (ver >= 7) {
      let r = ver;
      for (let i = 0; i < 12; ++i) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
      const b = (ver << 12) | r;
      for (let i = 0; i < 18; ++i) { const a = size - 11 + i % 3, c = Math.floor(i / 3); set(a, c, bit(b, i)); set(c, a, bit(b, i)); }
    }
    // The codewords, up and down in two-module columns from the right, skipping the timing column.
    let i = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let v = 0; v < size; ++v) for (let j = 0; j < 2; ++j) {
        const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
        if (!fn[y][x] && i < words.length * 8) { mod[y][x] = bit(words[i >>> 3], 7 - (i & 7)); ++i; }
      }
    }
    // Every mask gives a valid code; keep the one with the fewest 2×2 blocks and the most even balance.
    const masked = (m, x, y) => [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
      x * y % 2 + x * y % 3 === 0, (x * y % 2 + x * y % 3) % 2 === 0, ((x + y) % 2 + x * y % 3) % 2 === 0][m];
    const apply = m => { for (let y = 0; y < size; ++y) for (let x = 0; x < size; ++x) if (!fn[y][x] && masked(m, x, y)) mod[y][x] = !mod[y][x]; };
    const penalty = () => {
      let p = 0, dark = 0;
      for (let y = 0; y < size; ++y) for (let x = 0; x < size; ++x) {
        if (mod[y][x]) ++dark;
        if (x + 1 < size && y + 1 < size && mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1]) p += 3;
      }
      return p + 10 * Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size));
    };
    let best = 0, least = Infinity;
    for (let m = 0; m < 8; ++m) { apply(m); format(m); const s = penalty(); if (s < least) { least = s; best = m; } apply(m); }
    apply(best); format(best);
    return {size, version: ver, dark: (x, y) => mod[y][x]};
  }
  return {make};
})();
