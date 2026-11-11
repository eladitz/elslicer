// Settings guide: the Quality tab.
(() => {
  const GUIDES = {};
  const mm = v => `${+(+v).toFixed(2)} mm`;
  const tallest = ctx => ctx.objects.reduce((best, o) => (!best || o.height > best.height ? o : best), null);
  const layers = (height, first, layer) => height <= first ? 1 : 1 + Math.ceil((height - first) / layer - 1e-9);
  const colour = (ctx, i, fallback) => (ctx.colours && ctx.colours[i]) || fallback;
  const duration = minutes => minutes < 60 ? `${Math.round(minutes)} min` : `${Math.floor(minutes / 60)} h ${String(Math.round(minutes % 60)).padStart(2, '0')} min`;

  // ---- Layer height ------------------------------------------------------------------------------------------

  // A rounded top seen from the side, sliced the way the printer builds it, and a wall up close.
  function layerPicture(ctx, value) {
    const h = Math.max(0.02, +value || 0.2);
    const W = 760, H = 310;
    // Left: a dome 6 mm high, enlarged.
    const R = 2.5, s = 225 / R, x0 = 30, y0 = 280;
    let steps = '';
    for (let z = 0; z < R - 1e-6; z += h) {
      const top = Math.min(z + h, R), mid = (z + top) / 2;
      const half = Math.sqrt(Math.max(0, R * R - mid * mid));
      steps += `<rect x="${x0}" y="${y0 - top * s}" width="${half * s}" height="${(top - z) * s}" fill="#5b5bd6" stroke="#121316" stroke-width="${h * s > 4 ? 1 : 0.4}"/>`;
    }
    let arc = '';
    for (let a = 0; a <= 90; a += 2) {
      const r = a * Math.PI / 180;
      arc += `${a ? 'L' : 'M'}${x0 + Math.cos(r) * R * s},${y0 - Math.sin(r) * R * s}`;
    }
    // Right: 2 mm of wall, enlarged, each layer a squashed round line.
    const wx = 430, wy = 280, ws = 115, wallHeight = 2;
    let beads = '';
    for (let z = 0; z < wallHeight - 1e-6; z += h) {
      const top = Math.min(z + h, wallHeight), bh = (top - z) * ws;
      beads += `<rect x="${wx}" y="${wy - top * ws}" width="190" height="${bh}" rx="${Math.min(bh / 2, 26)}" fill="#5b5bd6" stroke="#121316" stroke-width="1"/>`;
    }
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, sans-serif" font-size="14">
      <rect width="${W}" height="${H}" fill="#121316"/>
      ${steps}
      <path d="${arc}" fill="none" stroke="#ececee" stroke-width="1.5" stroke-dasharray="5 4"/>
      <line x1="${x0}" y1="${y0}" x2="${x0 + 260}" y2="${y0}" stroke="#5a5c63"/>
      <text x="${x0}" y="20" fill="#a0a2a9">A rounded top, 2.5 mm high, enlarged</text>
      <text x="${x0}" y="36" fill="#a0a2a9">Dashed: your design. Blue: what prints.</text>
      ${beads}
      <line x1="${wx - 8}" y1="${wy}" x2="${wx + 200}" y2="${wy}" stroke="#5a5c63"/>
      <text x="${wx}" y="20" fill="#a0a2a9">A straight wall, 2 mm of it, enlarged</text>
      <text x="${wx}" y="36" fill="#a0a2a9">Each rounded line is one layer: ${Math.round(wallHeight / h)} layers here</text>
      <text x="${wx + 205}" y="${wy - 2}" fill="#5a5c63" font-size="11">bed</text>
    </svg>
    <div class="caption">At ${mm(h)}, the rounded top is built from ${Math.ceil(R / h)} steps. The gaps between the dashed line and the blue steps are the "staircase" you see and feel on curved tops.</div>`;
  }

  function layerEffects(ctx, value) {
    const v = +value, n = ctx.nozzle, now = +ctx.values.layer_height, first = +ctx.values.initial_layer_print_height || v;
    const out = [];
    const step = v / Math.tan(20 * Math.PI / 180);
    out.push(['Looks', (v <= 0.12 ? 'Layer lines are hard to see, and curved or sloped tops come out smooth.' :
      v <= 0.2 ? 'Layer lines show on walls when you look closely, and gentle slopes show small steps.' :
      'Layer lines are clearly visible, and sloped or rounded tops look stepped.') +
      ` On a shallow 20° slope each step is ${mm(step)} wide.`]);
    const t = tallest(ctx);
    if (t) {
      const count = layers(t.height, first, v), base = layers(t.height, first, now);
      const share = count / base;
      out.push(['Time', `${t.name} is ${mm(t.height.toFixed(1))} tall: ${count} layers` +
        (Math.abs(share - 1) < 0.005 ? ', the same as now.' :
          `, against ${base} now. Print time follows the number of layers, so expect roughly ${share < 1 ? Math.round((1 - share) * 100) + '% less' : Math.round((share - 1) * 100) + '% more'} time (a rough guide: travel and cooling don't scale exactly).`)]);
    } else {
      out.push(['Time', 'Print time follows the number of layers: halving the layer height roughly doubles the time.']);
    }
    out.push(['Strength', v > 0.75 * n ?
      `Above 75% of the ${n} mm nozzle (${mm(0.75 * n)}), each layer is pressed onto the one below less, and layers bond worse: parts split more easily along the layers.` :
      `Between 25% and 75% of the nozzle (${mm(0.25 * n)}–${mm(0.75 * n)}), the layer height changes strength far less than walls and infill do.`]);
    out.push(['Overhangs and detail', v <= 0.12 ?
      'Thin layers help: each layer sticks out less past the one below, so overhangs droop less, and small raised details such as text keep their shape.' :
      v <= 0.2 ? 'Overhangs up to about 45° print cleanly; fine raised details lose a little sharpness.' :
      'Each layer sticks out further past the one below, so steep overhangs droop more and small details round off.']);
    if (ctx.filaments > 1)
      out.push(['Colours', `With more than one filament the printer changes tools on every layer that has more than one colour, so more layers means more changes${t ? ` (${layers(t.height, first, v)} layers here)` : ''}.` +
        (ctx.uses_mix ? ' A mix made of whole layers shows as stripes this thick: thinner layers blend better when you look from a distance.' : '')]);
    const risks = [];
    if (v < ctx.min_layer || v > ctx.max_layer) risks.push(`${mm(v)} is outside what ${ctx.printer} allows (${mm(ctx.min_layer)}–${mm(ctx.max_layer)}).`);
    if (v < 0.25 * n) risks.push('So little plastic goes out per layer that the flow becomes uneven, and the print takes far longer for little gain.');
    if (v > 0.75 * n) risks.push('The nozzle may not keep up with the plastic needed, giving thin or gappy walls.');
    out.push(['Risk', risks.length ? `<span class="warning">${risks.join(' ')}</span>` : 'None for this printer.']);
    return out;
  }

  // ---- First layer height ------------------------------------------------------------------------------------

  // A first layer line laid over a bed that is a little uneven, as every bed is.
  function firstPicture(ctx, value) {
    const h = Math.max(0.05, +value || 0.2), wave = 0.05;
    const W = 760, H = 250, s = 380, base = 205, x0 = 20, x1 = 740;
    const bed = x => base - Math.sin((x - x0) / (x1 - x0) * Math.PI * 2.5) * wave * s;
    let bedPath = '', bead = `M${x0},${bed(x0)}`;
    for (let x = x0; x <= x1; x += 5) bedPath += `${x === x0 ? 'M' : 'L'}${x},${bed(x)}`;
    for (let x = x0; x <= x1; x += 5) bead += `L${x},${bed(x)}`;
    const nozzleY = base - h * s;
    bead += `L${x1},${nozzleY}L${x0},${nozzleY}Z`;
    const thin = h - wave, thick = h + wave;
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, sans-serif" font-size="14">
      <rect width="${W}" height="${H}" fill="#121316"/>
      <path d="${bead}" fill="#5b5bd6"/>
      <path d="${bedPath}L${x1},${H}L${x0},${H}Z" fill="#3a3c42"/>
      <path d="${bedPath}" fill="none" stroke="#7c7f88" stroke-width="2"/>
      <line x1="${x0}" y1="${nozzleY}" x2="${x1}" y2="${nozzleY}" stroke="#ececee" stroke-dasharray="6 4"/>
      <path d="M380,${nozzleY - 4} l-14,-34 h28 z" fill="#c9a227"/>
      <text x="${x0}" y="20" fill="#a0a2a9">The first layer from the side, heights enlarged. Dashed: where the nozzle runs.</text>
      <text x="${x0}" y="36" fill="#a0a2a9">The bed rises and falls by ${wave} mm here, which is normal even after levelling.</text>
      <text x="${x0 + 8}" y="${H - 10}" fill="#a0a2a9">bed</text>
    </svg>
    <div class="caption">Where the bed dips, the line is ${mm(thick)} thick and pressed on lightly; where it rises, it is only ${mm(Math.max(0, thin))} and squashed hard. The thicker the first layer, the smaller that difference is compared with the layer itself.</div>`;
  }

  function firstEffects(ctx, value) {
    const v = +value, n = ctx.nozzle, spread = Math.round(0.05 / v * 100);
    const out = [];
    out.push(['Sticking', spread <= 20 ? `Forgiving: a 0.05 mm uneven bed changes this layer by only ±${spread}%, so it sticks evenly everywhere.` :
      spread <= 30 ? `Fine on a well-levelled bed: a 0.05 mm unevenness changes this layer by ±${spread}%.` :
      `Demanding: a 0.05 mm unevenness changes this layer by ±${spread}%, so it can fail to stick where the bed dips, or the nozzle can scrape where it rises.`]);
    out.push(['Looks', v >= 0.28 ? 'The bottom face is smooth and flat, but the lines are pressed wide, and the bottom edge can bulge outwards a little ("elephant\'s foot").' :
      v >= 0.22 ? 'The bottom face is smooth with only a slight bulge at the bottom edge.' :
      'The bottom edge is crisp and true to size, and the bottom face shows the lines more.']);
    out.push(['Fit', v >= 0.28 ? 'A bulging bottom edge can make the first fraction of a millimetre slightly wider: holes at the bottom come out a bit smaller, and parts that slot together may need trimming there.' :
      'Bottom edges keep their size, which matters for parts that slot together.']);
    out.push(['Time', 'Hardly any difference: it is only one layer.']);
    const risks = [];
    if (v > 0.75 * n) risks.push(`Above 75% of the ${n} mm nozzle (${mm(0.75 * n)}), the plastic isn't pressed onto the bed enough to grip.`);
    if (v > ctx.max_layer) risks.push(`${ctx.printer} allows at most ${mm(ctx.max_layer)}.`);
    if (v < 0.15) risks.push('So thin that any unevenness in the bed shows, and the nozzle can drag through the plastic.');
    out.push(['Risk', risks.length ? `<span class="warning">${risks.join(' ')}</span>` : 'None for this printer.']);
    return out;
  }

  // ---- Mixed color sublayer ----------------------------------------------------------------------------------

  // The same 3-to-1 mix of two filaments, built from whole layers and from split layers.
  function sublayerPicture(ctx, value) {
    const on = value === '1' || value === 'true';
    const a = colour(ctx, 0, '#2E54DD'), b = colour(ctx, 1, '#21CC3D');
    const W = 760, H = 320, rows = 12, lh = 17, top = 56;
    const column = (x, split, lit) => {
      let out = '';
      for (let i = 0; i < rows; ++i) {
        const y = top + (rows - 1 - i) * lh;
        if (split) {
          out += `<rect x="${x}" y="${y + lh * 0.25}" width="200" height="${lh * 0.75}" fill="${a}"/>`;
          out += `<rect x="${x}" y="${y}" width="200" height="${lh * 0.25}" fill="${b}"/>`;
        } else {
          out += `<rect x="${x}" y="${y}" width="200" height="${lh}" fill="${i % 4 === 3 ? b : a}"/>`;
        }
      }
      return `<g opacity="${lit ? 1 : 0.45}">${out}<rect x="${x - 3}" y="${top - 3}" width="206" height="${rows * lh + 6}" fill="none" stroke="${lit ? '#5b5bd6' : '#34363c'}" stroke-width="2" rx="3"/></g>`;
    };
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="-apple-system, sans-serif" font-size="14">
      <rect width="${W}" height="${H}" fill="#121316"/>
      <text x="20" y="22" fill="#a0a2a9">A 75% / 25% mix of filaments 1 and 2, ${rows} layers, from the side</text>
      <text x="80" y="${top - 12}" fill="${on ? '#a0a2a9' : '#ececee'}" font-weight="600">Off: whole layers</text>
      ${column(60, false, !on)}
      <text x="420" y="${top - 12}" fill="${on ? '#ececee' : '#a0a2a9'}" font-weight="600">On: every layer split</text>
      ${column(400, true, on)}
      <text x="60" y="${top + rows * lh + 26}" fill="#a0a2a9">3 layers of 1, then 1 layer of 2: stripes</text>
      <text x="60" y="${top + rows * lh + 46}" fill="#a0a2a9">about 6 tool changes in these 12 layers</text>
      <text x="400" y="${top + rows * lh + 26}" fill="#a0a2a9">each layer: ¾ of it in 1, then ¼ in 2</text>
      <text x="400" y="${top + rows * lh + 46}" fill="#a0a2a9">about 24 tool changes in these 12 layers</text>
    </svg>
    <div class="caption">Both columns hold the same amount of each filament. Split layers spread it through every layer, so the colour is even instead of striped, at the cost of two tool changes per layer.</div>`;
  }

  function sublayerEffects(ctx, value) {
    const on = value === '1' || value === 'true';
    const lh = +ctx.values.layer_height;
    const out = [];
    if (!ctx.uses_mix)
      out.push(['This plate', 'Nothing on the plate prints with a mixed filament, so this setting changes nothing right now.']);
    out.push(['Colour', on ? 'Every layer holds both filaments in the mix\'s exact share, so the colour is even, with no stripes.' :
      'The mix is built from whole layers of each filament, so up close it shows as stripes one layer thick. Shares are rounded to simple ones: 80% / 20% prints as 4 layers to 1.']);
    out.push(['Time', 'Elslicer\'s estimate for a 20 mm cube on your Creator 5 profile: one filament 25 min; a 3-to-1 mix from whole layers 54 min; 1-to-1 from whole layers 1 h 10 min; with split layers 1 h 49 min. ' +
      (on ? 'Split layers cost the most because every layer needs two tool changes.' : 'Whole layers change tools only when the colour changes.')]);
    out.push(['Gradients', (on ? 'A gradient mix that runs up the height prints as you set it.' :
      '<span class="warning">A gradient mix that runs up the height is not printed as a gradient: each layer gets one whole filament.</span>') +
      ' A gradient you aimed sideways with the arrow doesn\'t need this: Elslicer cuts each layer in two along the arrow instead.' +
      (ctx.uses_up_gradient && !on ? ' <span class="warning">This plate has an up-the-height gradient, so turn this on for it.</span>' : '') +
      (ctx.uses_aimed_gradient ? ' Your aimed gradient prints the same either way.' : '')]);
    out.push(['Risk', on ? `Small shares give very thin passes: 20% of a ${mm(lh)} layer is ${mm(0.2 * lh)}, which can come out patchy. The first layer is never split, so it still sticks well.` :
      'None: whole layers print like ordinary layers.']);
    return out;
  }

  GUIDES.layer_height = {
    title: 'Layer height, step by step',
    intro: ctx => `<p>A printer builds the object as a stack of thin slices, one on top of the other. These three settings decide how thick those slices are, how the very first one meets the bed, and how mixed colours are made from them.</p>
      <p>Each step explains one setting, shows what it does to a print, and works out what it means for ${ctx.objects.length ? `<b>${tallest(ctx).name}</b>` : 'your object'} on <b>${ctx.printer}</b>.</p>`,
    steps: [
      {
        key: 'layer_height',
        title: 'Layer height',
        format: mm,
        explain: ctx => `<p>How thick each slice of the object is. The printer lays down one slice, moves up by this much, and lays down the next.</p>
          <p>It is the biggest trade in printing: <b>thinner layers look smoother and catch finer detail, but there are more of them, so the print takes longer</b>. Walls that go straight up look almost the same at any layer height; the difference shows on curves, slopes and rounded tops, where the object is built as a staircase of slices.</p>
          <p>Your ${ctx.nozzle} mm nozzle works best between 25% and 75% of its width: ${mm(0.25 * ctx.nozzle)} to ${mm(0.75 * ctx.nozzle)}.</p>`,
        picture: layerPicture,
        effects: layerEffects,
        choices: ctx => [
          ['0.08', 'Finest', 'Display pieces, small figures. Slowest.'],
          ['0.12', 'Fine', 'Smooth curves, still bearable time.'],
          ['0.16', 'Balanced', 'Good look for most prints.'],
          ['0.2', 'Standard', 'The usual default: quick and decent.'],
          ['0.24', 'Quick', 'Functional parts, visible lines.'],
          ['0.28', 'Fastest', 'Drafts and rough parts.'],
        ].filter(([v]) => +v >= ctx.min_layer - 1e-9 && +v <= ctx.max_layer + 1e-9 && +v <= 0.75 * ctx.nozzle + 1e-9)
         .map(([value, label, note]) => ({value, label: `${label}: ${value} mm`, note})),
        exact: ctx => ({min: ctx.min_layer, max: ctx.max_layer, step: 0.01, unit: 'mm'}),
      },
      {
        key: 'initial_layer_print_height',
        title: 'First layer height',
        format: mm,
        explain: ctx => `<p>How thick the very first slice is: the one pressed onto the bed. It is set apart from the other layers because it does a different job: <b>it has to stick</b>, and everything else is built on it.</p>
          <p>No bed is perfectly flat. Even after the printer levels itself, the surface rises and falls by a few hundredths of a millimetre. A thicker first layer makes those differences small compared with the layer, so it sticks evenly. Too thick, and it is pressed on too lightly to grip and bulges at the edge.</p>
          <p>It also becomes the bottom face of your object.</p>`,
        picture: firstPicture,
        effects: firstEffects,
        choices: ctx => [
          ['0.2', 'Crisp', 'Sharp bottom edge, needs a well-levelled bed.'],
          ['0.25', 'Balanced', 'Sticks reliably, small bulge. The Creator 5 default.'],
          ['0.3', 'Most forgiving', 'For a bed that gives trouble.'],
        ].filter(([v]) => +v <= ctx.max_layer + 1e-9 && +v <= 0.75 * ctx.nozzle + 1e-9)
         .map(([value, label, note]) => ({value, label: `${label}: ${value} mm`, note})),
        exact: ctx => ({min: 0.1, max: Math.min(ctx.max_layer, 0.75 * ctx.nozzle), step: 0.01, unit: 'mm'}),
      },
      {
        key: 'enable_mixed_color_sublayer',
        title: 'Mixed color sublayer',
        format: v => (v === '1' || v === 'true') ? 'On' : 'Off',
        explain: ctx => `<p>Only matters for <b>mixed filaments</b>: colours made from two or more real filaments, such as your 1→2 mixes. The printer can't blend plastics in the nozzle, so it shares the layers between them.</p>
          <p><b>Off</b>, it uses whole layers: some layers in one filament, some in the other. <b>On</b>, it splits every layer into thin passes, one per filament, so each layer holds both. Split layers give an even colour and are needed for gradients that run up the height, but the printer changes tools twice in every layer.</p>`,
        picture: sublayerPicture,
        effects: sublayerEffects,
        choices: () => [
          {value: '0', label: 'Off: whole layers', note: 'Faster. Mixes look striped up close.'},
          {value: '1', label: 'On: split layers', note: 'Even colour, up-the-height gradients. Slowest.'},
        ],
      },
    ],
  };
  window.SECTIONS['Layer height'] = {intro: GUIDES.layer_height.intro};
  for (const step of GUIDES.layer_height.steps) window.SETTINGS[step.key] = step;
})();
