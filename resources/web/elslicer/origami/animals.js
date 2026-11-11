// Whole animals for the origami dialog, each made of a few folded sheets glued together.
//
// A sheet part is an open surface of large flat faces, like folded paper: points by name, x forward, y to the
// animal's left and z up, in mm at the animal's natural proportions (the dialog scales the whole animal), and faces
// as lists of point names. A symmetric sheet is given by its left half: points off the middle (y > 0) and the faces
// using them are mirrored to the right. mirror adds a copy of the whole part on the right side, for ears and wings.
// A face of more than three points that isn't flat folds along a diagonal.
(function () {
  const S = (name, points, faces, o = {}) => ({name, points, faces, ...o});

  // A hollow shell open underneath, like the elephant's: stations from back to front, each a point on the spine
  // [x, z], one on the left eave [x, y, z] and one on the left side's lower edge [x, y, z]. A leg is a side panel
  // hanging from the lower edge between two stations down to two feet; rump and chest close the ends down to a
  // point on the middle.
  function shell(name, stations, legs, o = {}) {
    const points = {}, faces = [];
    stations.forEach(([rx, rz, ex, ey, ez, mx, my, mz], i) => {
      points['R' + i] = [rx, 0, rz]; points['E' + i] = [ex, ey, ez]; points['M' + i] = [mx, my, mz];
    });
    for (let i = 0; i + 1 < stations.length; ++i) {
      faces.push(['R' + i, 'R' + (i + 1), 'E' + (i + 1), 'E' + i]);
      faces.push(['E' + i, 'E' + (i + 1), 'M' + (i + 1), 'M' + i]);
    }
    legs.forEach(([from, to, front, back], k) => {
      points['Fa' + k] = front; points['Fb' + k] = back;
      const poly = [];
      for (let i = from; i <= to; ++i) poly.push('M' + i);
      faces.push([...poly, 'Fa' + k, 'Fb' + k]);
    });
    const n = stations.length - 1;
    if (o.rump) { points.C0 = [o.rump[0], 0, o.rump[1]]; faces.push(['R0', 'E0', 'M0', 'C0']); }
    if (o.chest) { points.C1 = [o.chest[0], 0, o.chest[1]]; faces.push(['R' + n, 'C1', 'M' + n, 'E' + n]); }
    return S(name, points, faces, {symmetric: true});
  }
  // A shell standing on its legs: stations [x, spine z, eave y, eave z, side y, side z], legs [from, to, front foot x, back foot x].
  const body = (name, stations, legs, o = {}) => shell(name,
    stations.map(([x, rz, ey, ez, my, mz]) => [x, rz, x, ey, ez, x, my, mz]),
    legs.map(([from, to, fx, bx]) => {
      const y = stations[to][4] * 0.85, y2 = stations[from][4] * 0.85;
      return [from, to, [fx, y, 0], [bx, y2, 0]];
    }), o);
  // A head open at the back: a crease down the middle from the crown over the brow to the nose and under to the
  // chin, and a cheek point on each side. Points are [x, z], the cheek [x, y, z].
  const head = (name, {crown, brow, nose, chin, cheek}) => S(name,
    {K: [crown[0], 0, crown[1]], B: [brow[0], 0, brow[1]], N: [nose[0], 0, nose[1]], J: [chin[0], 0, chin[1]], C: cheek},
    [['K', 'B', 'C'], ['B', 'N', 'C'], ['N', 'J', 'C']], {symmetric: true});
  // A V-pleated strip, its crease along the spine [[x, z, half width]], its sides going off to the left of the way
  // it runs (side -1: to the right) by depth times the width. The last point can have no width: the strip ends in a point.
  // With y it runs that far to the left of the middle, and a copy on the right, for legs.
  function strip(name, spine, o = {}) {
    const side = o.side || 1, depth = o.depth ?? 1, points = {}, faces = [];
    spine.forEach(([x, z, w], i) => {
      const a = spine[Math.max(0, i - 1)], b = spine[Math.min(spine.length - 1, i + 1)];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / l, tz = (b[1] - a[1]) / l;
      points['K' + i] = [x, 0, z];
      if (w > 0) points['S' + i] = [x - side * tz * w * depth, w, z + side * tx * w * depth];
    });
    for (let i = 0; i + 1 < spine.length; ++i)
      faces.push(spine[i + 1][2] > 0 ? ['K' + i, 'K' + (i + 1), 'S' + (i + 1), 'S' + i] : ['K' + i, 'K' + (i + 1), 'S' + i]);
    if (!o.y) return S(name, points, faces, {symmetric: true});
    for (const [n, p] of Object.entries(points)) {
      if (n[0] === 'S') points['T' + n.slice(1)] = [p[0], o.y - p[1], p[2]];
      p[1] += o.y;
    }
    for (const f of faces.slice()) faces.push(f.map(n => n[0] === 'S' ? 'T' + n.slice(1) : n).reverse());
    return S(name, points, faces, {mirror: true});
  }
  // A flat flap folded once along the line from its base's middle to its tip, for ears, horns and fins: base a and b, tip t, and how far the crease stands out.
  const flap = (name, a, b, t, lift = [0, 1.5, 0], o = {}) => {
    const m = [(a[0] + b[0]) / 2 + lift[0], (a[1] + b[1]) / 2 + lift[1], (a[2] + b[2]) / 2 + lift[2]];
    return S(name, {A: a, B: b, T: t, M: m}, [['A', 'M', 'T'], ['M', 'B', 'T']], {mirror: true, ...o});
  };

  const ANIMALS = {
    elephant: {name: 'Elephant', parts: [
      // Hollow, open underneath: a roof over the back, and sides that come down as the legs and the head's sides.
      S('Body', {
        R0: [-40, 0, 50], R1: [-28, 0, 66], R2: [-6, 0, 72], R3: [14, 0, 76], R4: [34, 0, 78],
        E0: [-42, 14, 44], E1: [-30, 24, 58], E2: [-6, 28, 62], E3: [14, 26, 68], E4: [35, 20, 74],
        M1: [-34, 24, 30], M2: [-12, 27, 34], M3: [8, 27, 36], M4: [26, 22, 42],
        b0: [-44, 12, 26], b1: [-36, 20, 0], b2: [-18, 22, 0], b3: [-13, 24, 28], b4: [4, 24, 28],
        b5: [8, 22, 0], b6: [26, 20, 0], b7: [30, 17, 38], b8: [40, 15, 46],
        c0: [-45, 0, 24], F0: [41, 0, 44],
      }, [
        ['R0', 'R1', 'E1', 'E0'], ['R1', 'R2', 'E2', 'E1'], ['R2', 'R3', 'E3', 'E2'], ['R3', 'R4', 'E4', 'E3'],
        ['R0', 'E0', 'b0', 'c0'],
        ['E0', 'b0', 'b1', 'M1'], ['E0', 'M1', 'E1'], ['M1', 'b1', 'b2', 'M2'], ['E1', 'M1', 'M2'], ['M2', 'b2', 'b3'],
        ['M2', 'b3', 'b4', 'M3'], ['E1', 'M2', 'M3', 'E2'], ['M3', 'b4', 'b5'], ['M3', 'b5', 'b6', 'M4'], ['E2', 'M3', 'M4', 'E3'],
        ['M4', 'b6', 'b7'], ['E3', 'M4', 'b7', 'b8', 'E4'],
        ['R4', 'E4', 'b8', 'F0'],
      ], {symmetric: true}),
      // A big flat flap, its back edge flaring out along two creases, and a strip along its front edge to glue to the side of the head.
      S('Ear', {A: [37, 22, 82], B: [4, 31, 86], Cb: [-6, 42, 60], C: [2, 44, 34], D: [27, 31, 28], A2: [38, 17, 79], D2: [32, 16, 36]},
        [['B', 'Cb', 'D'], ['Cb', 'C', 'D'], ['B', 'D', 'A'], ['A', 'D', 'D2', 'A2']], {mirror: true}),
      // A pleated strip, open at the back, curling up to a point.
      S('Trunk', {
        K0: [43, 0, 48], K1: [48, 0, 30], K2: [56, 0, 20], K3: [64, 0, 26], K4: [68, 0, 42],
        S0: [37, 12, 46], S1: [41, 10, 30], S2: [50, 8, 24], S3: [59, 5, 30],
      }, [['K0', 'K1', 'S1', 'S0'], ['K1', 'K2', 'S2', 'S1'], ['K2', 'K3', 'S3', 'S2'], ['K3', 'K4', 'S3']], {symmetric: true}),
      S('Tail', {T0: [-42, 0, 40], T1: [-42, 0, 30], T2: [-54, 0, 30], L: [-42, 3, 35]},
        [['T0', 'T2', 'L'], ['L', 'T2', 'T1']], {symmetric: true}),
    ]},
    giraffe: {name: 'Giraffe', centre: [0, 0, 100], parts: [
      body('Body', [[-28, 98, 9, 92, 11, 74], [-18, 104, 13, 98, 14, 72], [0, 106, 14, 100, 15, 74], [16, 110, 13, 104, 14, 76], [26, 112, 10, 106, 12, 80]],
        [[0, 1, -21, -27], [3, 4, 24, 18]], {rump: [-30, 78], chest: [28, 84]}),
      strip('Neck', [[24, 110, 8], [34, 140, 6], [42, 168, 4.5]], {depth: 1.2}),
      head('Head', {crown: [38, 176], brow: [48, 179], nose: [64, 168], chin: [48, 162], cheek: [48, 7, 170]}),
      flap('Horn', [40, 2, 177], [44, 3, 178], [40, 4, 190]),
      flap('Ear', [43, 5, 174], [46, 6, 171], [42, 15, 177], [0, 0, 1.5]),
      strip('Tail', [[-29, 96, 2.5], [-36, 76, 2], [-38, 66, 0]]),
    ]},
    bear: {name: 'Bear', parts: [
      body('Body', [[-46, 50, 18, 44, 22, 26], [-30, 64, 26, 58, 28, 24], [-6, 70, 30, 64, 30, 26], [18, 68, 28, 62, 28, 26], [36, 62, 22, 56, 24, 24]],
        [[0, 1, -32, -46], [3, 4, 34, 20]], {rump: [-50, 24], chest: [40, 28]}),
      head('Head', {crown: [34, 74], brow: [56, 72], nose: [76, 56], chin: [52, 38], cheek: [56, 17, 58]}),
      flap('Ear', [40, 9, 73], [46, 15, 70], [41, 17, 82], [0, 0, 1.5]),
    ]},
    pig: {name: 'Pig', parts: [
      body('Body', [[-40, 40, 16, 36, 20, 22], [-24, 50, 24, 46, 26, 20], [0, 54, 27, 50, 28, 20], [24, 52, 25, 48, 26, 20], [40, 46, 18, 42, 20, 22]],
        [[0, 1, -28, -38], [3, 4, 36, 26]], {rump: [-44, 22], chest: [44, 24]}),
      // A blunt head ending in the flat disc of the snout.
      S('Head', {C: [38, 0, 54], N1: [62, 0, 46], N2: [62, 0, 30], Ns: [62, 8, 38], K: [46, 19, 40], J: [42, 0, 24]},
        [['C', 'N1', 'Ns', 'K'], ['N1', 'N2', 'Ns'], ['K', 'Ns', 'N2', 'J']], {symmetric: true}),
      flap('Ear', [42, 8, 53], [45, 16, 48], [56, 14, 62], [0, 0, 2]),
      strip('Tail', [[-41, 40, 2.5], [-49, 46, 2], [-47, 53, 0]]),
    ]},
    rabbit: {name: 'Rabbit', parts: [
      // Sitting: a big haunch at the back, the chest high at the front on two short legs.
      body('Body', [[-28, 18, 10, 14, 16, 4], [-18, 34, 16, 28, 20, 6], [-4, 40, 17, 34, 20, 8], [8, 38, 14, 32, 15, 14], [16, 32, 10, 28, 10, 18]],
        [[0, 2, 4, -26], [3, 4, 19, 12]], {rump: [-30, 6], chest: [18, 20]}),
      head('Head', {crown: [10, 48], brow: [24, 48], nose: [35, 38], chin: [20, 30], cheek: [22, 10, 40]}),
      flap('Ear', [13, 3, 48], [19, 5, 47], [8, 8, 80], [0, 1.5, 1]),
      S('Tail', {T0: [-29, 0, 22], T1: [-29, 0, 10], T2: [-37, 0, 16], L: [-29, 5, 16]}, [['T0', 'T2', 'L'], ['L', 'T2', 'T1']], {symmetric: true}),
    ]},
    fox: {name: 'Fox', parts: [
      body('Body', [[-34, 48, 9, 44, 10, 36], [-20, 52, 12, 48, 13, 34], [2, 52, 13, 48, 13, 34], [20, 54, 12, 50, 12, 34], [30, 56, 10, 52, 10, 36]],
        [[0, 1, -24, -34], [3, 4, 30, 20]], {rump: [-36, 38], chest: [32, 40]}),
      head('Head', {crown: [28, 72], brow: [38, 74], nose: [64, 60], chin: [38, 52], cheek: [40, 11, 62]}),
      flap('Ear', [33, 3, 72], [40, 9, 71], [33, 9, 88], [1, 1, 0]),
      strip('Tail', [[-33, 48, 5], [-50, 42, 11], [-68, 32, 10], [-82, 27, 0]]),
    ]},
    dog: {name: 'Dog', parts: [
      body('Body', [[-34, 50, 10, 46, 12, 36], [-20, 56, 14, 52, 15, 34], [0, 56, 15, 52, 15, 36], [18, 58, 14, 54, 14, 36], [30, 60, 11, 56, 12, 38]],
        [[0, 1, -24, -34], [3, 4, 30, 20]], {rump: [-36, 38], chest: [32, 40]}),
      head('Head', {crown: [28, 76], brow: [42, 78], nose: [62, 66], chin: [42, 56], cheek: [44, 11, 68]}),
      flap('Ear', [33, 7, 77], [39, 10, 75], [41, 15, 60], [0, 2, 0]),
      strip('Tail', [[-33, 54, 3], [-44, 66, 2.5], [-42, 79, 0]], {side: -1}),
    ]},
    kangaroo: {name: 'Kangaroo', centre: [0, 0, 40], parts: [
      // Upright, open down the front.
      shell('Body', [[-16, 14, -6, 16, 14, 6, 13, 12], [-14, 36, -4, 15, 36, 8, 12, 34], [-6, 58, 2, 12, 58, 10, 9, 56], [2, 74, 8, 8, 74, 12, 6, 72]],
        [[0, 1, [28, 12, 0], [-14, 14, 0]]]),
      head('Head', {crown: [-2, 86], brow: [8, 90], nose: [26, 82], chin: [10, 74], cheek: [10, 7, 84]}),
      flap('Ear', [0, 2, 88], [5, 5, 88], [-4, 7, 106], [0, 1.5, 0]),
      flap('Arm', [10, 8, 62], [12, 9, 54], [22, 9, 44], [1.5, 0, 0]),
      strip('Tail', [[-15, 22, 7], [-40, 9, 5], [-66, 2, 0]]),
    ]},
    crane: {name: 'Crane', centre: [0, 0, 20], parts: [
      // The classic bird base: a deep diamond body, wings off its top edges, a thin neck and tail standing up.
      S('Body', {F: [16, 0, 32], B: [-16, 0, 32], K: [0, 0, 8], W: [0, 9, 30]}, [['F', 'W', 'K'], ['W', 'B', 'K']], {symmetric: true}),
      S('Wing', {F: [12, 3, 33], B: [-12, 3, 33], M: [0, 30, 40], T: [-14, 62, 46]}, [['F', 'M', 'T'], ['F', 'B', 'M'], ['B', 'T', 'M']], {mirror: true}),
      strip('Neck', [[14, 33, 3.5], [30, 56, 2.5], [38, 74, 1.5]], {depth: 1.5}),
      strip('Head', [[37, 72, 1.6], [48, 66, 0]], {depth: 1.5}),
      strip('Tail', [[-14, 33, 3.5], [-30, 56, 2.5], [-40, 76, 0]], {side: -1, depth: 1.5}),
    ]},
    shark: {name: 'Shark', centre: [0, 0, 24], parts: [
      // A hull of long flat panels: the back, the flanks and the belly, meeting at the nose and the tail.
      S('Body', {
        N: [60, 0, 26], T: [-54, 0, 27],
        U1: [34, 0, 38], U2: [6, 0, 44], U3: [-26, 0, 38],
        F1: [34, 13, 28], F2: [6, 17, 30], F3: [-26, 11, 28],
        D1: [34, 0, 18], D2: [6, 0, 14], D3: [-26, 0, 20],
      }, [['N', 'U1', 'F1'], ['U1', 'U2', 'F2', 'F1'], ['U2', 'U3', 'F3', 'F2'], ['U3', 'T', 'F3'],
          ['N', 'F1', 'D1'], ['F1', 'F2', 'D2', 'D1'], ['F2', 'F3', 'D3', 'D2'], ['F3', 'T', 'D3']], {symmetric: true}),
      S('Back fin', {A: [14, 0, 42], B: [-6, 0, 43], T: [-10, 0, 66], G: [10, 4, 41], H: [-4, 4, 42]},
        [['A', 'B', 'T'], ['A', 'G', 'H', 'B']]),
      S('Tail fin', {A: [-50, 0, 30], B: [-54, 0, 24], T: [-70, 0, 58], L: [-64, 0, 6], G: [-52, 4, 27], M: [-60, 0, 28]},
        [['A', 'M', 'T'], ['B', 'L', 'M'], ['A', 'G', 'B', 'M']]),
      flap('Side fin', [22, 14, 24], [10, 16, 22], [4, 40, 8], [0, 0, 1.5]),
    ]},
    squirrel: {name: 'Squirrel', centre: [0, 0, 30], parts: [
      // Sitting up, open down the front, with the tail curling up its back.
      shell('Body', [[-10, 6, -2, 14, 6, 8, 12, 4], [-10, 22, -1, 13, 22, 9, 11, 20], [-4, 38, 3, 10, 38, 10, 8, 36], [4, 48, 8, 7, 48, 12, 5, 46]],
        [[0, 1, [18, 10, 0], [-10, 12, 0]]]),
      head('Head', {crown: [2, 58], brow: [12, 60], nose: [24, 52], chin: [12, 44], cheek: [12, 8, 54]}),
      flap('Ear', [3, 3, 59], [7, 5, 58], [3, 6, 68], [0, 1.2, 0]),
      flap('Arm', [10, 7, 38], [11, 8, 32], [19, 7, 30], [1, 0, 0]),
      strip('Tail', [[-11, 8, 6], [-26, 18, 12], [-32, 40, 14], [-24, 62, 11], [-10, 72, 0]], {side: -1}),
    ]},
    dragon: {name: 'Dragon', parts: [
      body('Body', [[-30, 42, 9, 38, 11, 30], [-16, 48, 14, 44, 15, 28], [4, 50, 15, 46, 15, 30], [20, 52, 13, 48, 13, 30], [30, 54, 10, 50, 10, 32]],
        [[0, 1, -20, -30], [3, 4, 32, 22]], {rump: [-32, 32], chest: [32, 34]}),
      strip('Neck', [[28, 52, 7], [38, 66, 5.5], [44, 80, 4.5]], {depth: 1.2}),
      head('Head', {crown: [38, 88], brow: [50, 90], nose: [70, 82], chin: [50, 76], cheek: [52, 7, 84]}),
      flap('Horn', [41, 3, 89], [46, 4, 89], [32, 6, 102], [0, 0, 1.5]),
      // A bat wing: three panels fanning out from the shoulder, each fold a finger.
      S('Wing', {A: [16, 6, 52], B: [-10, 8, 50], F1: [10, 34, 90], F2: [-12, 60, 98], F3: [-40, 46, 64], C: [-14, 20, 60]},
        [['A', 'F1', 'C', 'B'], ['F1', 'F2', 'C'], ['F2', 'F3', 'C']], {mirror: true}),
      strip('Tail', [[-30, 42, 7], [-52, 30, 5], [-76, 18, 3.5], [-92, 22, 0]]),
    ]},
    rooster: {name: 'Rooster', centre: [0, 0, 50], parts: [
      body('Body', [[-24, 56, 10, 52, 13, 40], [-8, 62, 15, 58, 16, 36], [10, 64, 15, 60, 15, 38], [22, 66, 11, 62, 11, 44]], [],
        {rump: [-26, 44], chest: [26, 46]}),
      strip('Neck', [[20, 66, 6], [28, 82, 5], [32, 92, 4]], {depth: 1.2}),
      head('Head', {crown: [28, 100], brow: [36, 102], nose: [46, 94], chin: [34, 88], cheek: [36, 5, 96]}),
      S('Comb', {A: [28, 0, 100], B: [38, 0, 102], T1: [27, 0, 108], T2: [32, 0, 111], T3: [37, 0, 108], G: [33, 3, 100]},
        [['A', 'B', 'T3', 'T2', 'T1'], ['A', 'G', 'B']]),
      S('Wattle', {A: [38, 0, 90], B: [44, 0, 92], T: [40, 0, 80], G: [41, 3, 90]}, [['A', 'B', 'T'], ['A', 'G', 'B']]),
      // A tail of three tall feathers fanned up behind.
      S('Tail', {A: [-18, 0, 60], B: [-26, 0, 50], T1: [-34, 0, 112], T2: [-54, 0, 106], T3: [-62, 0, 80], S1: [-28, 8, 76], S2: [-40, 10, 78]},
        [['A', 'T1', 'S1'], ['S1', 'T1', 'T2', 'S2'], ['S2', 'T2', 'T3'], ['S2', 'T3', 'B'], ['A', 'S1', 'S2', 'B']], {symmetric: true}),
      strip('Leg', [[0, 40, 3], [2, 20, 2.5], [3, 0, 2]], {depth: 1.2, y: 6}),
      flap('Wing', [12, 15, 58], [-16, 13, 54], [-20, 18, 40], [0, 1.5, 0]),
    ]},
  };

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const unit = a => mul(a, 1 / (Math.hypot(...a) || 1));

  // A sheet part as an open, outward-facing mesh, facing away from centre.
  function sheet(part, centre) {
    const names = Object.keys(part.points), index = {}, v = [];
    for (const name of names) { index[name] = v.length; v.push(part.points[name]); }
    const polygons = part.faces.map(face => face.map(name => index[name]));
    if (part.symmetric) {
      const across = {};
      for (const name of names) {
        const p = part.points[name];
        if (Math.abs(p[1]) < 1e-9) across[index[name]] = index[name];
        else { across[index[name]] = v.length; v.push([p[0], -p[1], p[2]]); }
      }
      for (const face of part.faces.map(face => face.map(name => index[name])))
        if (face.some(i => across[i] !== i)) polygons.push(face.map(i => across[i]).reverse());
    }
    // Fans, split along the first point's diagonals.
    const f = [];
    for (const poly of polygons) for (let k = 1; k + 1 < poly.length; ++k) f.push([poly[0], poly[k], poly[k + 1]]);
    // One way round every edge, starting from the first face, then all turned to face away from centre.
    const key = (a, b) => a < b ? a + ',' + b : b + ',' + a;
    const faces_of = {};
    f.forEach((t, i) => { for (let k = 0; k < 3; ++k) (faces_of[key(t[k], t[(k + 1) % 3])] ||= []).push(i); });
    const done = new Array(f.length).fill(false);
    for (let start = 0; start < f.length; ++start) {
      if (done[start]) continue;
      done[start] = true;
      const queue = [start], component = [start];
      while (queue.length) {
        const i = queue.pop(), t = f[i];
        for (let k = 0; k < 3; ++k) {
          const a = t[k], b = t[(k + 1) % 3];
          for (const j of faces_of[key(a, b)]) {
            if (done[j]) continue;
            const u = f[j];
            // A neighbour runs the shared edge the other way.
            for (let m = 0; m < 3; ++m) if (u[m] === a && u[(m + 1) % 3] === b) u.reverse();
            done[j] = true;
            queue.push(j);
            component.push(j);
          }
        }
      }
      let out = 0;
      for (const i of component) {
        const [a, b, c] = f[i].map(j => v[j]);
        const n = cross(sub(b, a), sub(c, a)), mid = mul(add(add(a, b), c), 1 / 3);
        out += dot(n, sub(mid, centre));
      }
      if (out < 0) for (const i of component) f[i].reverse();
    }
    return {v, f};
  }

  // The animal's parts, scaled so its longest side is size mm and standing on z = 0.
  function build(key, size) {
    const parts = [];
    const centre = ANIMALS[key].centre || [0, 0, 50];
    for (const part of ANIMALS[key].parts) {
      parts.push({name: part.name, ...sheet(part, centre)});
      if (part.mirror) {
        const points = {};
        for (const [name, p] of Object.entries(part.points)) points[name] = [p[0], -p[1], p[2]];
        parts.push({name: part.name, ...sheet({...part, points}, centre)});
      }
    }
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of parts) for (const q of p.v) for (let i = 0; i < 3; ++i) { lo[i] = Math.min(lo[i], q[i]); hi[i] = Math.max(hi[i], q[i]); }
    const k = size / Math.max(...hi.map((h, i) => h - lo[i]));
    for (const p of parts) p.v = p.v.map(q => [(q[0] - (lo[0] + hi[0]) / 2) * k, (q[1] - (lo[1] + hi[1]) / 2) * k, (q[2] - lo[2]) * k]);
    return parts;
  }

  window.ORIGAMI = {animals: Object.entries(ANIMALS).map(([key, a]) => ({key, name: a.name})), build};
})();
