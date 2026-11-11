// Settings guide: the Strength tab (Walls, Top/bottom shells, Infill, Advanced).
(() => {
  const {C, num, length, on, round, mm, pct, svg, text, rect, line, bead, warn, wallSection} = G;
  const S = window.SETTINGS;
  const lh = ctx => num(ctx.values.layer_height) || 0.2;
  const wallW = ctx => { const w = length(ctx.values.inner_wall_line_width, ctx.nozzle); return w > 0 ? w : 1.125 * ctx.nozzle; };

  // A box cut in half: walls on the sides, solid layers top and bottom, infill inside.
  function cutaway(ctx, o = {}) {
    const walls = Math.max(0, Math.round(o.walls ?? num(ctx.values.wall_loops) ?? 2));
    const top = Math.max(0, Math.round(o.top ?? num(ctx.values.top_shell_layers) ?? 4));
    const bottom = Math.max(0, Math.round(o.bottom ?? num(ctx.values.bottom_shell_layers) ?? 3));
    const density = (o.density ?? num(ctx.values.sparse_infill_density) ?? 15) / 100;
    const x0 = 120, y0 = 40, W = 520, H = 200, step = 10;
    let body = text(20, 24, o.title || 'A box cut in half, enlarged: walls, solid top and bottom layers, and infill');
    body += rect(x0, y0, W, H, C.bg, {stroke: C.line});
    // Infill: diagonal lines spaced by density.
    if (density > 0) {
      const gap = Math.max(6, 18 / Math.max(0.05, density));
      body += `<clipPath id="in"><rect x="${x0 + walls * step}" y="${y0 + top * 8}" width="${W - 2 * walls * step}" height="${H - (top + bottom) * 8}"/></clipPath><g clip-path="url(#in)">`;
      for (let x = -H; x < W + H; x += gap) body += line(x0 + x, y0 + H, x0 + x + H, y0, C.plastic2, {sw: 3}) + line(x0 + x, y0, x0 + x + H, y0 + H, C.plastic2, {sw: 3});
      body += '</g>';
    }
    for (let i = 0; i < top; ++i) body += rect(x0, y0 + i * 8, W, 7, i === 0 ? C.accent2 : C.accent, {rx: 2});
    for (let i = 0; i < bottom; ++i) body += rect(x0, y0 + H - (i + 1) * 8, W, 7, C.accent, {rx: 2});
    for (let i = 0; i < walls; ++i) body += rect(x0 + i * step, y0, step - 1, H, i === 0 ? C.accent2 : C.accent, {rx: 2}) + rect(x0 + W - (i + 1) * step + 1, y0, step - 1, H, i === 0 ? C.accent2 : C.accent, {rx: 2});
    body += text(x0 + W + 14, y0 + 14, `${top} top layers`, {size: 12}) + text(x0 + W + 14, y0 + H - 4, `${bottom} bottom layers`, {size: 12});
    body += text(x0 - 14, y0 + H / 2, `${walls} walls`, {size: 12, anchor: 'end'});
    body += text(x0 + W / 2, y0 + H + 24, density > 0 ? `infill ${Math.round(density * 100)}%` : 'hollow inside', {anchor: 'middle', size: 12});
    return svg(760, 280, body, o.caption);
  }

  // An infill pattern seen from above in a square.
  function pattern(name, density = 0.2, caption) {
    const x0 = 250, y0 = 40, s = 260, gap = Math.min(70, Math.max(12, 7 / Math.max(0.05, density)));
    let body = text(20, 24, 'The infill seen from above in one layer');
    body += `<clipPath id="sq"><rect x="${x0}" y="${y0}" width="${s}" height="${s}"/></clipPath>` + rect(x0, y0, s, s, C.bg, {stroke: C.accent, sw: 6});
    let g = '';
    const L = (a, b, c, d) => g += line(a, b, c, d, C.accent2, {sw: 3});
    const diag = sign => { for (let x = -s; x < 2 * s; x += gap) L(x0 + x, y0 + (sign > 0 ? s : 0), x0 + x + s, y0 + (sign > 0 ? 0 : s)); };
    const straight = dir => { for (let x = 0; x < s; x += gap) dir ? L(x0 + x, y0, x0 + x, y0 + s) : L(x0, y0 + x, x0 + s, y0 + x); };
    switch (name) {
      case 'grid': case 'crosshatch': case 'rectilinear': case 'alignedrectilinear': case 'zigzag': case 'crosszag': case 'lockedzag':
        diag(1); if (name === 'grid' || name === 'crosshatch') diag(-1); break;
      case 'line': diag(1); break;
      case 'triangles': case 'tri-hexagon': case 'cubic': case 'adaptivecubic': case 'quartercubic': case 'supportcubic':
        diag(1); diag(-1); straight(false); break;
      case 'honeycomb': case '3dhoneycomb': case 'lateral-honeycomb': {
        const r = gap / 1.6;
        for (let row = 0; row * r * 1.5 < s + r; ++row) for (let col = 0; col * r * 1.75 < s + r; ++col) {
          const cx = x0 + col * r * 1.75 + (row % 2 ? r * 0.87 : 0), cy = y0 + row * r * 1.5;
          g += `<polygon points="${[0, 1, 2, 3, 4, 5].map(i => `${cx + r * Math.cos(Math.PI / 3 * i + Math.PI / 6)},${cy + r * Math.sin(Math.PI / 3 * i + Math.PI / 6)}`).join(' ')}" fill="none" stroke="${C.accent2}" stroke-width="3"/>`;
        } break;
      }
      case 'gyroid': case 'tpmsd': case 'tpmsfk':
        for (let y = 0; y < s + gap; y += gap) { let d = `M${x0},${y0 + y}`; for (let x = 0; x <= s; x += 6) d += ` L${x0 + x},${y0 + y + gap * 0.35 * Math.sin(x / gap * Math.PI)}`; g += `<path d="${d}" fill="none" stroke="${C.accent2}" stroke-width="3"/>`; } break;
      case 'lightning':
        g += `<path d="M${x0 + 130},${y0 + 40} L${x0 + 110},${y0 + 110} L${x0 + 140},${y0 + 150} L${x0 + 120},${y0 + 230} M${x0 + 110},${y0 + 110} L${x0 + 60},${y0 + 140} M${x0 + 140},${y0 + 150} L${x0 + 200},${y0 + 170}" fill="none" stroke="${C.accent2}" stroke-width="3"/>`;
        body += text(x0 + s + 20, y0 + 130, 'only under the top,', {size: 12}) + text(x0 + s + 20, y0 + 146, 'like tree roots', {size: 12}); break;
      case 'concentric': for (let i = gap / 2; i < s / 2; i += gap) g += rect(x0 + i, y0 + i, s - 2 * i, s - 2 * i, 'none', {stroke: C.accent2, sw: 3}); break;
      case 'hilbertcurve': case 'archimedeanchords': case 'octagramspiral': {
        let d = '', a = 0; for (let r = 4; r < s / 1.4; r += 0.6) { a += 0.18; d += `${d ? 'L' : 'M'}${x0 + s / 2 + r * Math.cos(a) * 0.7},${y0 + s / 2 + r * Math.sin(a) * 0.7} `; }
        g += `<path d="${d}" fill="none" stroke="${C.accent2}" stroke-width="3"/>`; break;
      }
      default: diag(1); diag(-1);
    }
    body += `<g clip-path="url(#sq)">${g}</g>`;
    return svg(760, 320, body, caption);
  }

  const patternNotes = {
    rectilinear: 'Lines in one direction, crossing each layer. Fast; weak between layers.',
    alignedrectilinear: 'Like rectilinear, all layers the same way.',
    zigzag: 'Rectilinear joined into one continuous zigzag: fewer stops.',
    crosszag: 'Zigzag that crosses each layer.',
    lockedzag: 'Zigzag with interlocked skin and core.',
    line: 'Plain parallel lines. Very fast, weak.',
    grid: 'Crossing lines in every layer. Strong, fast; the nozzle crosses its own lines.',
    triangles: 'Triangles in every layer. Stiff sideways.',
    'tri-hexagon': 'Triangles and hexagons. Stiff and even.',
    cubic: 'Cubes tilted on a corner. Strong in all directions, quick.',
    adaptivecubic: 'Cubic, denser near the walls and sparse in the middle. Saves time and plastic.',
    quartercubic: 'A finer cubic.',
    supportcubic: 'Sparse except right under the tops. Saves the most for display parts.',
    lightning: 'Only branches that hold up the top. Fastest; almost no strength.',
    honeycomb: 'Hexagons. Very strong, but slow.',
    '3dhoneycomb': 'Honeycomb that shifts with height. Strong in all directions.',
    'lateral-honeycomb': 'Honeycomb seen from the side.',
    'lateral-lattice': 'Angled lattice, set by the angles below.',
    crosshatch: 'Crossing lines that change direction with height. Strong and fast.',
    tpmsd: 'A smooth 3D surface pattern. Strong in all directions.',
    tpmsfk: 'Another smooth 3D surface pattern.',
    gyroid: 'Smooth waves. Strong in all directions, good for flexible materials; slower to slice.',
    concentric: 'Rings following the outline. Good for flexible parts.',
    hilbertcurve: 'A maze-like curve. Decorative.',
    archimedeanchords: 'A spiral. Decorative.',
    octagramspiral: 'A star spiral. Decorative.',
  };
  const surfaceNotes = {
    monotonic: 'Lines laid in one order: an even, smooth sheen.',
    monotonicline: 'Monotonic, joined into one line: fewer stops.',
    rectilinear: 'Back and forth: fast, the sheen varies.',
    alignedrectilinear: 'Every layer the same way.',
    concentric: 'Rings following the outline.',
    spiralinset: 'A spiral from the edge inwards.',
    hilbertcurve: 'A maze pattern, decorative.',
    archimedeanchords: 'A spiral, decorative.',
    octagramspiral: 'A star spiral, decorative.',
  };

  // ---- Walls
  window.SECTIONS['Strength/Walls'] = {
    intro: ctx => `<p>Walls are the loops around the outline of every layer: the skin of the part. Most of a print's strength comes from its walls, much more than from the infill inside. More walls make a part tougher, stiffer and more watertight, and hide the infill pattern from showing through.</p>
      <p>With your ${ctx.nozzle} mm nozzle, each wall is about ${mm(wallW(ctx))} thick.</p>`,
  };

  S.wall_loops = {
    title: 'Wall loops',
    explain: ctx => `<p>How many loops make up each wall. 2 is usual for looks; 3 or 4 for parts that will be screwed, clamped, dropped or loaded. Extra walls add strength faster than extra infill does, for the same plastic.</p>`,
    picture: (ctx, v) => wallSection(Array.from({length: Math.max(1, Math.round(num(v)))}, () => wallW(ctx)), lh(ctx), {lit: 0, title: `The wall cut through: ${num(v)} loops side by side`, caption: `About ${mm(num(v) * wallW(ctx))} of solid wall on every side.`}),
    effects: (ctx, v) => { const n = num(v); return [
      ['Strength', n <= 1 ? warn('One loop: fragile, and often not watertight.') : n === 2 ? 'Fine for display and light use.' : n <= 4 ? 'Tough: good for functional parts and screws.' : 'Very strong; the part is nearly solid near its surface.'],
      ['Looks', n <= 1 ? 'The infill can show through.' : 'The infill stays hidden.'],
      ['Time and plastic', n > 3 ? 'Noticeably more of both.' : 'A little more per extra loop.']]; },
    choices: () => [{value: '2', label: '2', note: 'Display parts.'}, {value: '3', label: '3', note: 'Everyday functional.'}, {value: '4', label: '4', note: 'Strong parts.'}, {value: '6', label: '6', note: 'Very strong.'}],
  };

  S.alternate_extra_wall = {
    title: 'Alternate extra wall',
    explain: () => `<p>Adds one more wall on every other layer. The infill then gets wedged between walls of different sizes, locking layers together and making the part stronger, for less plastic than a full extra wall.</p>
      <p>It requires Ensure vertical shell thickness to be off, and doesn't suit Lightning infill.</p>`,
    effects: (ctx, v) => on(v) ? [['Strength', 'Stronger between layers.'], ['Time', 'A bit more, on alternate layers.']] : [['Strength', 'Normal.']],
    notes: {'1': 'An extra wall every other layer.', '0': 'Normal.'},
  };

  S.detect_thin_wall = {
    title: 'Detect thin walls',
    explain: () => `<p>A wall too thin to fit two lines would normally be skipped. On, it is printed as one single line instead, so thin fins and blades appear. That single line is not a closed loop, so it may look less neat. Arachne handles this better on its own.</p>`,
    effects: (ctx, v) => on(v) ? [['Detail', 'Very thin walls are printed.']] : [['Detail', 'Walls thinner than two lines may be missing (with Classic).']],
    notes: {'1': 'Print single-line walls.', '0': 'Skip them.'},
  };

  // ---- Top/bottom shells
  window.SECTIONS['Top/bottom shells'] = {
    intro: () => `<p>The infill inside is mostly air, so the top and bottom of a part need several fully solid layers to close it off. These are the <b>shells</b>.</p>
      <p>Too few top layers and the infill shows through as bumps or holes in the top ("pillowing"); more layers give a smoother, stronger top. These settings also choose the line pattern of those solid layers, which is what you see on the top and bottom faces.</p>`,
  };

  const shellLayers = (side) => ({
    title: `${side === 'top' ? 'Top' : 'Bottom'} shell layers`,
    explain: ctx => `<p>How many solid layers close off the ${side} of the part, counting the ${side} surface itself. With ${mm(lh(ctx))} layers, each one adds ${mm(lh(ctx))} of solid ${side}.</p>
      ${side === 'top' ? '<p>The top needs more than the bottom, because it is printed over sparse infill and each layer must bridge the gaps of the one below.</p>' : '<p>The bottom sits on the bed, so it closes up with fewer layers.</p>'}`,
    picture: (ctx, v) => cutaway(ctx, {[side]: num(v)}),
    effects: (ctx, v) => { const n = num(v), t = n * lh(ctx), min = num(ctx.values[`${side}_shell_thickness`]) || 0; return [
      ['Thickness', `${mm(t)} of solid ${side}${min > t ? `, raised to the ${mm(min)} minimum set below` : ''}.`],
      ['Looks', side === 'top' ? (t < 0.6 ? warn('Thin: the infill may show through as bumps or holes.') : 'A closed, smooth top.') : (t < 0.4 ? 'Thin: may show the infill from below.' : 'A solid bottom.')],
      ['Strength', n >= 5 ? 'Strong, stiff faces.' : 'Normal.']]; },
    choices: () => side === 'top' ? [{value: '3', label: '3', note: 'Minimum.'}, {value: '4', label: '4', note: 'Usual.'}, {value: '5', label: '5', note: 'Smoother tops.'}, {value: '7', label: '7', note: 'Low infill or fine layers.'}] :
      [{value: '2', label: '2', note: 'Minimum.'}, {value: '3', label: '3', note: 'Usual.'}, {value: '4', label: '4', note: 'Stronger base.'}],
  });
  S.top_shell_layers = shellLayers('top');
  S.bottom_shell_layers = shellLayers('bottom');

  const shellThickness = side => ({
    title: `${side === 'top' ? 'Top' : 'Bottom'} shell thickness`,
    explain: ctx => `<p>A minimum thickness for the ${side} shell, in mm. If the layer count above gives less than this (for example with very thin layers), more layers are added. 0 means only the layer count counts.</p>`,
    effects: (ctx, v) => { const t = num(v), n = num(ctx.values[`${side}_shell_layers`]) || 0; return [['Result', t === 0 ? `Always ${n} layers.` : `At least ${Math.max(n, Math.ceil(t / lh(ctx) - 1e-6))} layers at your layer height.`]]; },
    choices: () => side === 'top' ? [{value: '0.6', label: '0.6 mm', note: 'Default.'}, {value: '0.8', label: '0.8 mm', note: 'Smoother.'}, {value: '1', label: '1 mm', note: 'Strong.'}, {value: '0', label: 'Off', note: 'Layers only.'}] :
      [{value: '0', label: 'Off', note: 'Layers only.'}, {value: '0.5', label: '0.5 mm', note: 'A minimum.'}],
  });
  S.top_shell_thickness = shellThickness('top');
  S.bottom_shell_thickness = shellThickness('bottom');

  const penetration = side => ({
    title: `${side === 'top' ? 'Top' : 'Bottom'} paint penetration layers`,
    explain: () => `<p>When you paint a colour on the ${side} of a part, how many layers deep it goes. 0 uses the ${side} shell count. Deeper paint hides the colour underneath better (a light colour over dark needs more layers), but costs more colour changes.</p>`,
    effects: (ctx, v) => [['Looks', num(v) === 0 ? 'As deep as the shell.' : num(v) < 3 ? 'Thin: the colour below may show through.' : 'An opaque painted face.']],
    choices: () => [{value: '0', label: 'Shell depth', note: 'Default.'}, {value: '2', label: '2', note: 'Fewer changes.'}, {value: '5', label: '5', note: 'Opaque.'}],
  });
  S.top_color_penetration_layers = penetration('top');
  S.bottom_color_penetration_layers = penetration('bottom');

  S.top_surface_density = {
    title: 'Top surface density',
    explain: () => `<p>How dense the very top layer is. 100% is solid and smooth. Lower values leave gaps on purpose, showing the pattern as a texture. 0% prints only the walls on the top layer. It is a decorative setting, not a fix for over-extrusion.</p>`,
    effects: (ctx, v) => [['Looks', num(v) >= 100 ? 'A smooth, closed top.' : num(v) === 0 ? 'Only the outline on top.' : 'A textured, open top showing the pattern.']],
    choices: () => [{value: '100%', label: '100%', note: 'Solid.'}, {value: '60%', label: '60%', note: 'Textured.'}],
  };
  S.bottom_surface_density = {
    title: 'Bottom surface density',
    explain: () => `<p>How dense the bottom layer is. Lower values give a textured bottom face, but much less contact with the bed, so the print may not stick.</p>`,
    effects: (ctx, v) => [['Sticking', num(v) >= 100 ? 'Full contact.' : warn('Less contact with the bed: it may come loose.')]],
    choices: () => [{value: '100%', label: '100%', note: 'Solid.'}, {value: '70%', label: '70%', note: 'Textured.'}],
  };

  const surfacePattern = side => ({
    title: `${side === 'top' ? 'Top' : 'Bottom'} surface pattern`,
    explain: () => `<p>The line pattern of the ${side} face, the one you see. <b>Monotonic</b> lays every line in the same order and direction, so light reflects evenly: the smoothest-looking choice. <b>Rectilinear</b> is quicker but its sheen varies. <b>Concentric</b> follows the outline in rings. The spirals and Hilbert curve are decorative.</p>`,
    picture: (ctx, v) => pattern(v === 'monotonic' || v === 'monotonicline' ? 'line' : v, 1, 'Seen from above.'),
    notes: surfaceNotes,
  });
  S.top_surface_pattern = surfacePattern('top');
  S.bottom_surface_pattern = surfacePattern('bottom');

  const fillOrder = side => ({
    title: `${side === 'top' ? 'Top' : 'Bottom'} surface fill order`,
    explain: () => `<p>For the ring and spiral patterns: which way they go. <b>Outward</b> starts in the centre and pushes extra plastic to the edge, where it shows least. <b>Inward</b> starts at the edge${side === 'bottom' ? ', which helps the first layer stick because the tight centre curves come last' : ''}.</p>`,
    notes: {default: 'Shortest path.', outward: 'Centre first.', inward: 'Edge first.'},
  });
  S.top_surface_fill_order = fillOrder('top');
  S.bottom_surface_fill_order = fillOrder('bottom');

  const direction = side => ({
    title: `${side === 'top' ? 'Top' : 'Bottom'} layer direction`,
    explain: () => `<p>A fixed angle for the lines of the ${side} face. -1 lets them follow the normal solid infill direction. A fixed angle is handy to run the lines along a long part, which looks cleaner.</p>`,
    choices: () => [{value: '-1', label: 'Automatic', note: 'Follow solid infill.'}, {value: '0', label: '0°', note: 'Along X.'}, {value: '45', label: '45°', note: 'Diagonal.'}, {value: '90', label: '90°', note: 'Along Y.'}],
  });
  S.top_layer_direction = direction('top');
  S.bottom_layer_direction = direction('bottom');

  S.top_surface_expansion = {
    title: 'Top surface expansion',
    explain: () => `<p>Grows top surfaces by this much to join pieces that are split by something rising from them, like raised text on a plate. Instead of the top going around each letter, it continues under them as one smooth surface.</p>`,
    effects: (ctx, v) => [['Looks', num(v) === 0 ? 'The top is split around raised features.' : 'One continuous, cleaner top around raised features.']],
    choices: () => [{value: '0', label: 'Off', note: ''}, {value: '1', label: '1 mm', note: 'Join small gaps.'}, {value: '2', label: '2 mm', note: 'Join larger gaps.'}],
  };
  S.top_surface_expansion_margin = {
    title: 'Top expansion wall margin',
    explain: () => `<p>Keeps expanded tops this far from the outer walls, so their shrinking doesn't leave a line on the outside.</p>`,
    choices: () => [{value: '0', label: '0', note: 'Default.'}, {value: '0.4', label: '0.4 mm', note: 'Avoid wall marks.'}],
  };
  S.top_surface_expansion_direction = {
    title: 'Top expansion direction',
    explain: () => `<p><b>Inward</b> grows into holes left by features in the middle of a top. <b>Outward</b> grows the edges to join surfaces split apart, as in a lattice. Both does both.</p>`,
    notes: {inward_and_outward: 'Both ways.', inward: 'Into holes.', outward: 'Outwards.'},
  };
  S.center_of_surface_pattern = {
    title: 'Center surface pattern on',
    explain: () => `<p>For spiral patterns, where the centre of the spiral goes: on each separate surface, on each body, or one shared centre for the whole object.</p>`,
    notes: {each_surface: 'Every surface its own.', each_model: 'One per body.', each_assembly: 'One for all.'},
  };
  S.top_bottom_infill_wall_overlap = {
    title: 'Top/bottom infill/wall overlap',
    explain: () => `<p>How far the solid top and bottom lines reach into the walls, as a % of the wall width. A little overlap bonds them and closes the tiny pinholes that can show where a top meets its walls.</p>`,
    effects: (ctx, v) => [['Looks', num(v) < 15 ? 'Pinholes along the edges of tops are possible.' : num(v) > 40 ? 'A raised edge where the top meets the wall.' : 'A closed, clean edge.']],
    choices: () => [{value: '25%', label: '25%', note: 'Default.'}, {value: '30%', label: '30%', note: 'If you see pinholes.'}],
  };

  // ---- Infill
  window.SECTIONS['Infill'] = {
    intro: () => `<p>Inside the walls and shells, a part is not solid: it is filled with a light pattern called <b>infill</b>. It holds the walls in shape and supports the top layers, while saving lots of plastic and time.</p>
      <p>The <b>density</b> decides how much of the inside is plastic and the <b>pattern</b> decides its shape. Remember that walls give more strength than infill: for a strong part, add walls before raising density far.</p>`,
  };

  S.sparse_infill_density = {
    title: 'Sparse infill density',
    explain: () => `<p>How much of the inside is filled with plastic. 0% is hollow; 100% is solid.</p>
      <p>10-15% is plenty for display parts. 20-30% is good for everyday functional parts. Above 40% strength grows slowly while time and plastic grow fast.</p>`,
    picture: (ctx, v) => cutaway(ctx, {density: num(v)}),
    effects: (ctx, v) => { const d = num(v); return [
      ['Strength', d < 10 ? 'Weak inside: fine for decoration only.' : d < 20 ? 'Light use.' : d < 40 ? 'Good for functional parts.' : 'Very strong, approaching solid.'],
      ['Tops', d < 10 ? warn('Tops may sag between infill lines: add top layers.') : 'Well supported.'],
      ['Time and plastic', d > 40 ? 'Much more of both.' : `Roughly proportional to the ${pct(d)}.`]]; },
    choices: () => [{value: '10%', label: '10%', note: 'Display.'}, {value: '15%', label: '15%', note: 'Light.'}, {value: '25%', label: '25%', note: 'Functional.'}, {value: '40%', label: '40%', note: 'Strong.'}],
  };

  S.fill_multiline = {
    title: 'Fill multiline',
    explain: () => `<p>Prints each infill line as several lines side by side. With the same density, the pattern has fewer, thicker strands; it can be stronger and works well for decorative see-through infill.</p>`,
    effects: (ctx, v) => [['Pattern', num(v) <= 1 ? 'Single strands.' : `${num(v)} lines per strand.`]],
    choices: () => [{value: '1', label: '1', note: 'Default.'}, {value: '2', label: '2', note: 'Thicker strands.'}],
  };

  S.sparse_infill_pattern = {
    title: 'Sparse infill pattern',
    explain: () => `<p>The shape of the infill. Some patterns are the same in every layer (grid, triangles), so the nozzle crosses its own lines and the part is stronger sideways than up and down. Others change with height (cubic, gyroid, crosshatch), so the part is equally strong in all directions.</p>
      <p>Gyroid and cubic are good all-round choices; lightning is fastest for display parts; honeycomb is very strong but slow.</p>`,
    picture: (ctx, v) => pattern(v, (num(ctx.values.sparse_infill_density) || 15) / 100),
    effects: (ctx, v) => [['This pattern', patternNotes[v] || '']],
    notes: patternNotes,
  };

  S.adaptive_infill_mode = {
    title: 'Adaptive density',
    explain: () => `<p>For Gyroid and TPMS infill: makes the infill dense near the outside of the part, where strength matters, and sparse in the middle. The density at the surface is your sparse infill density; the middle uses the Interior density below. Experimental.</p>`,
    effects: (ctx, v) => v === 'disabled' ? [['Infill', 'Even density throughout.']] : [['Infill', 'Dense at the skin, sparse at the core: less plastic for similar strength.'], ['Note', 'Experimental, and only for Gyroid or TPMS.']],
    notes: {disabled: 'Off.', distance_warp: 'One stretched pattern.', smooth_blend: 'Densities blended.', stepped_shells: 'Shells of fixed density.'},
  };
  S.adaptive_infill_interior_density = {
    title: 'Interior density',
    explain: () => `<p>The infill density at the centre of the part, when adaptive density is on.</p>`,
    choices: () => [{value: '5%', label: '5%', note: 'Default.'}, {value: '10%', label: '10%', note: 'Firmer core.'}],
  };
  S.adaptive_infill_gradient = {
    title: 'Adaptive gradient',
    explain: () => `<p>How the density changes from surface to centre: steadily (Linear), staying dense near the surface longer (Quadratic), or dropping quickly under the surface (Exponential).</p>`,
    notes: {linear: 'Steady.', quadratic: 'Dense near the surface longer.', exponential: 'Drops fast under the surface.'},
  };
  S.gyroid_optimized = {
    title: 'Z-buckling bias optimization',
    explain: () => `<p>For low-density gyroid: squeezes the wave up and down so the infill's columns are shorter, making the part resist being crushed from the top. Same plastic. No effect from about 30% density.</p>`,
    notes: {'1': 'Better crush resistance.', '0': 'Normal gyroid.'},
  };
  S.sparse_infill_smooth_factor = {
    title: 'Sparse infill smooth factor',
    explain: () => `<p>Rounds the sharp corners where infill lines turn. Rounded paths let the printer keep its speed, which can be faster and quieter. 0% keeps sharp corners.</p>`,
    choices: () => [{value: '0%', label: '0%', note: 'Sharp.'}, {value: '50%', label: '50%', note: 'Rounded.'}],
  };
  S.infill_direction = {
    title: 'Sparse infill direction',
    explain: () => `<p>The angle of the infill lines. 45° is usual. Turning it can line the infill up with the direction a part will be loaded.</p>`,
    choices: () => [{value: '45', label: '45°', note: 'Default.'}, {value: '0', label: '0°', note: 'Along X.'}],
  };
  const template = what => ({
    title: `${what} rotation template`,
    explain: () => `<p>Rotates the ${what.toLowerCase()} lines layer by layer following a list of angles, like "0,30,60,90", which repeats. "+5" turns 5° every layer. When set, the normal direction is ignored. Leave empty for normal.</p>`,
  });
  S.sparse_infill_rotate_template = template('Sparse infill');
  S.solid_infill_rotate_template = template('Solid infill');

  S.skin_infill_density = {title: 'Skin infill density', explain: () => `<p>For the Locked Zag pattern: the density of the infill just inside the walls (the "skin"). Denser skin makes a stiffer shell.</p>`};
  S.skeleton_infill_density = {title: 'Skeleton infill density', explain: () => `<p>For the Locked Zag pattern: the density of the core of the part (the "skeleton"), away from the walls.</p>`};
  S.infill_lock_depth = {title: 'Infill lock depth', explain: () => `<p>How far the skin and skeleton overlap, locking them together.</p>`};
  S.skin_infill_depth = {title: 'Skin infill depth', explain: () => `<p>How deep the skin reaches in from the walls.</p>`};
  S.skin_infill_line_width = {title: 'Skin line width', explain: () => `<p>The line width used in the skin area.</p>`};
  S.skeleton_infill_line_width = {title: 'Skeleton line width', explain: () => `<p>The line width used in the skeleton area.</p>`};
  S.symmetric_infill_y_axis = {
    title: 'Symmetric infill Y axis',
    explain: () => `<p>For a pair of mirrored parts (a left and right piece): turn this on for one of them so its infill pattern mirrors the other's, giving matching textures if they are visible.</p>`,
    notes: {'1': 'Mirror this part\'s infill.', '0': 'Normal.'},
  };
  S.infill_complete_top = {
    title: 'Fill pattern tops',
    explain: () => `<p>Closes off the tops of the infill pattern where it meets the layers above.</p>`,
    notes: {'1': 'Close tops.', '0': 'Leave open.'},
  };
  S.infill_shift_step = {title: 'Infill shift step', explain: () => `<p>Shifts each layer of infill slightly, producing a crossed texture. Used by the Cross Zag patterns.</p>`};
  S.lateral_lattice_angle_1 = {title: 'Lateral lattice angle 1', explain: () => `<p>For the Lateral Lattice pattern: the lean of the first set of struts, from vertical.</p>`};
  S.lateral_lattice_angle_2 = {title: 'Lateral lattice angle 2', explain: () => `<p>The lean of the second set of struts.</p>`};
  S.infill_overhang_angle = {title: 'Infill overhang angle', explain: () => `<p>For lateral honeycomb: the angle of the slanted lines. 60° gives a perfect honeycomb.</p>`};
  S.lightning_overhang_angle = {title: 'Lightning overhang angle', explain: () => `<p>Lightning infill grows branches only where something above needs holding up. This is how steep a branch may lean; steeper leans use less plastic but hold less.</p>`};
  S.lightning_prune_angle = {title: 'Prune angle', explain: () => `<p>How eagerly short or unneeded lightning branches are removed. Higher prunes more.</p>`};
  S.lightning_straightening_angle = {title: 'Straightening angle', explain: () => `<p>How much lightning branches may be straightened to simplify them.</p>`};

  S.infill_anchor_max = {
    title: 'Maximum length of the infill anchor',
    explain: () => `<p>Infill lines end at the walls. Each end can be joined to the next line by a short stretch running along the wall, an <b>anchor</b>, so the infill grips the walls. This is the longest such stretch. As a % it is of the infill line width; 0 uses the old method.</p>`,
    effects: (ctx, v) => [['Strength', num(v) === 0 ? 'Old style joins.' : 'Infill well tied to the walls.']],
  };
  S.infill_anchor = {
    title: 'Sparse infill anchor length',
    explain: () => `<p>When an infill line can only be joined on one side, how long its anchor along the wall may be. 0 turns off those one-sided anchors.</p>`,
    notes: {'0': 'No open anchors.', '1000': 'Unlimited.'},
  };
  S.internal_solid_infill_pattern = {
    title: 'Internal solid infill pattern',
    explain: () => `<p>The pattern of solid layers hidden inside (under the top, over the bottom, and in small areas). Unseen, so pick what prints fastest and fills well; monotonic or rectilinear are usual.</p>`,
    notes: surfaceNotes,
  };
  S.solid_infill_direction = {title: 'Solid infill direction', explain: () => `<p>The angle of the solid layers' lines. 45° is usual; each layer crosses the one below.</p>`};

  S.gap_fill_target = {
    title: 'Apply gap fill',
    explain: () => `<p>Where solid lines leave tiny gaps too narrow for a full line, gap fill puts a thin line in. <b>Everywhere</b> is strongest; <b>Top and bottom surfaces</b> keeps visible faces free of pinholes without overfilling inside; <b>Nowhere</b> is fastest.</p>`,
    effects: (ctx, v) => ({everywhere: [['Strength', 'Fullest solid layers.'], ['Risk', 'Can overfill and roughen tops.']], topbottom: [['Looks', 'No pinholes on visible faces.']], nowhere: [['Looks', 'Tiny gaps may show on tops.'], ['Time', 'Fastest.']]}[v] || []),
    notes: {everywhere: 'Strongest.', topbottom: 'Visible faces only.', nowhere: 'Fastest.'},
  };
  S.filter_out_gap_fill = {
    title: 'Filter out tiny gaps',
    explain: () => `<p>Gap fill shorter than this length (mm) is skipped. Very short gap fills cost time and can leave blobs.</p>`,
    choices: () => [{value: '0', label: '0', note: 'Fill all.'}, {value: '0.5', label: '0.5 mm', note: 'Skip the smallest.'}],
  };
  S.separated_infills = {
    title: 'Separated infills',
    explain: () => `<p>Centres each part's infill on itself, as if sliced alone, instead of one pattern across the whole assembly. Useful when several separate objects are grouped and should look consistent.</p>`,
    notes: {'1': 'Each part its own.', '0': 'One pattern for the whole.'},
  };
  S.infill_wall_overlap = {
    title: 'Infill/wall overlap',
    explain: () => `<p>How far the infill reaches into the walls, as a % of the wall width, so they bond. 10-15% is enough; more can pile up plastic and roughen the top.</p>`,
    effects: (ctx, v) => [['Strength', num(v) < 5 ? 'The infill may separate from the walls.' : 'Bonded.'], ['Looks', num(v) > 25 ? 'Rough spots near walls on tops.' : 'Fine.']],
    choices: () => [{value: '15%', label: '15%', note: 'Default.'}, {value: '10%', label: '10%', note: 'Less buildup.'}],
  };

  // ---- Advanced
  window.SECTIONS['Strength/Advanced'] = {
    intro: () => `<p>Finer control over line directions, extra solid layers, bridge angles and a few time savers. The defaults suit most parts.</p>`,
  };
  S.align_infill_direction_to_model = {
    title: 'Align directions to model',
    explain: () => `<p>Turns the infill, bridge, ironing and top/bottom directions with the part when you rotate it on the plate, so the lines keep the same orientation relative to the part.</p>`,
    notes: {'1': 'Rotate with the part.', '0': 'Fixed to the bed.'},
  };
  S.extra_solid_infills = {
    title: 'Insert solid layers',
    explain: () => `<p>Adds fully solid layers inside the part at chosen heights, to stiffen it. "5" adds one every 5th layer; "10#2" adds 2 solid layers every 10; "1,7,9" adds at those layers. Leave empty for none.</p>`,
  };
  const bridgeAngle = what => ({
    title: `${what} bridge infill direction`,
    explain: () => `<p>Forces the direction of ${what.toLowerCase()} bridge lines. 0 lets Elslicer choose the best (shortest) direction for each bridge, which is almost always right. Use 180 for an absolute 0°.</p>`,
    choices: () => [{value: '0', label: 'Automatic', note: 'Recommended.'}, {value: '90', label: '90°', note: 'Forced.'}],
  });
  S.bridge_angle = bridgeAngle('External');
  S.internal_bridge_angle = bridgeAngle('Internal');
  S.relative_bridge_angle = {
    title: 'Relative bridge angle',
    explain: () => `<p>On, the bridge angles above are added to the automatic direction instead of replacing it.</p>`,
    notes: {'1': 'Offset the automatic angle.', '0': 'Replace it.'},
  };
  S.minimum_sparse_infill_area = {
    title: 'Minimum sparse infill threshold',
    explain: () => `<p>Infill areas smaller than this (mm²) are printed solid instead. Tiny patches of sparse infill are weak and slow; solid is better there.</p>`,
    choices: () => [{value: '15', label: '15 mm²', note: 'Default.'}, {value: '0', label: '0', note: 'Never.'}],
  };
  S.infill_combination = {
    title: 'Infill combination',
    explain: ctx => `<p>Prints the sparse infill only every few layers, in thicker lines, while walls keep the normal layer height. With ${mm(lh(ctx))} layers and a ${ctx.nozzle} mm nozzle, the infill can be printed every ${Math.max(1, Math.floor(ctx.nozzle / lh(ctx)))} layers. It saves a lot of time on fine-layer prints.</p>`,
    effects: (ctx, v) => on(v) ? [['Time', 'Faster, especially with thin layers.'], ['Strength', 'Slightly less, unless the max height below is lowered.']] : [['Time', 'Infill on every layer.']],
    notes: {'1': 'Infill every few layers.', '0': 'Every layer.'},
  };
  S.infill_combination_max_layer_height = {
    title: 'Max layer height',
    explain: ctx => `<p>The thickest the combined infill may be. 100% is the nozzle (${ctx.nozzle} mm), the fastest; about 80% keeps the infill stronger.</p>`,
    choices: () => [{value: '100%', label: '100%', note: 'Fastest.'}, {value: '80%', label: '80%', note: 'Stronger.'}],
  };
  S.detect_narrow_internal_solid_infill = {
    title: 'Detect narrow internal solid infills',
    explain: () => `<p>Narrow strips of solid fill are printed with rings that follow their shape instead of back and forth, which is faster in tight spaces.</p>`,
    notes: {'1': 'Rings in narrow areas.', '0': 'Back and forth.'},
  };
  S.ensure_vertical_shell_thickness = {
    title: 'Ensure vertical shell thickness',
    explain: () => `<p>On sloped surfaces, the top and bottom layers get thin where they lean, and the infill can show through. This adds solid fill near slopes to keep the shell properly thick.</p>
      <p><b>All</b> is safest; <b>Moderate</b> only for steep slopes; <b>Critical only</b> avoids adding it next to walls; <b>None</b> is fastest but slopes may have holes.</p>`,
    effects: (ctx, v) => ({none: [['Looks', warn('Sloped surfaces may show holes or infill.')]], ensure_critical_only: [['Looks', 'Most slopes fine.']], ensure_moderate: [['Looks', 'Steep slopes filled.']], ensure_all: [['Looks', 'Solid slopes.'], ['Time', 'A little more plastic.']]}[v] || []),
    notes: {none: 'Fastest; risky on slopes.', ensure_critical_only: 'Critical spots.', ensure_moderate: 'Steep slopes.', ensure_all: 'All slopes (default).'},
  };
})();
