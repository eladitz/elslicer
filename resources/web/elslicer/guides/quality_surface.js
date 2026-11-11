// Settings guide: the Ironing and Z contouring sections of the Quality tab.
(() => {
  const {C, num, on, round, mm, svg, text, rect, line, bead, warn} = G;
  const S = window.SETTINGS;

  // A top surface cut through: ridged lines, and the hot nozzle smoothing them with a trickle of plastic.
  function iron(type, flow, spacing, caption) {
    const x0 = 60, y = 170, n = 12, w = 52, h = 26;
    const ironed = type && type !== 'no ironing';
    let body = text(20, 24, 'The top surface cut through, enlarged: the last layer\'s lines, then the ironing pass');
    for (let i = 0; i < n; ++i) body += bead(x0 + i * w, y - h, w + 2, h, C.plastic);
    body += rect(x0, y, n * w, 30, C.plastic2);
    if (ironed) {
      const f = Math.max(0, Math.min(1, num(flow) / 25));
      // Plastic filling the valleys between lines.
      for (let i = 0; i < n - 1; ++i) body += `<path d="M${x0 + (i + 1) * w - 14},${y - h + 6} Q${x0 + (i + 1) * w},${y - h + 18 - 12 * f} ${x0 + (i + 1) * w + 14},${y - h + 6} Z" fill="${C.warm}" opacity="${0.4 + 0.6 * f}"/>`;
      body += line(x0, y - h - 2, x0 + n * w, y - h - 2, C.warm, {sw: 3});
      body += `<path d="M${x0 + 7 * w - 40},${y - h - 120} L${x0 + 7 * w - 10},${y - h - 4} L${x0 + 7 * w + 10},${y - h - 4} L${x0 + 7 * w + 40},${y - h - 120} Z" fill="#c9a227"/>`;
      body += text(x0 + 7 * w + 50, y - h - 60, 'the hot nozzle slides over the top again,', {fill: C.text});
      body += text(x0 + 7 * w + 50, y - h - 42, 'pushing a trickle of plastic into the grooves', {fill: C.text});
      if (f > 0.85) body += text(x0, y + 56, 'Lots of plastic: the grooves overflow and the surface can turn rough', {fill: C.bad});
    } else body += text(x0, y + 56, 'Without ironing, the grooves between lines stay: you can see and feel them', {fill: C.muted});
    return svg(760, 240, body, caption);
  }

  window.SECTIONS['Ironing'] = {
    intro: () => `<p>A flat top is made of lines laid side by side, and between each pair is a tiny groove. You can see the pattern and feel it with a fingernail.</p>
      <p><b>Ironing</b> runs the hot nozzle over the finished top one more time, slowly and in very close lines, pushing out just a trickle of plastic. It melts the ridges and fills the grooves, leaving a smooth, often glossy face. It costs time: ironing a large top can add a lot to the print.</p>`,
  };

  S.ironing_type = {
    title: 'Ironing type',
    explain: () => `<p>Which flat surfaces get ironed.</p>
      <p><b>Topmost surface only</b> irons just the very top of each part, the one you look at. <b>All top surfaces</b> also irons every flat top on the way up, like the steps of a staircase. <b>All solid layers</b> irons every solid layer, including hidden ones, and is rarely worth the time.</p>`,
    picture: (ctx, v) => iron(v, ctx.values.ironing_flow, ctx.values.ironing_spacing),
    effects: (ctx, v) => ({
      'no ironing': [['Looks', 'Tops show their line pattern.'], ['Time', 'No extra time.']],
      topmost: [['Looks', 'The very top is smooth; lower flat steps keep their lines.'], ['Time', 'Extra time for the top only.']],
      top: [['Looks', 'Every flat top is smooth.'], ['Time', 'Extra time on every flat area that faces up.']],
      solid: [['Looks', 'Like all top surfaces; hidden layers too.'], ['Time', warn('Much longer prints for no visible gain.')]],
    }[v] || []),
    notes: {'no ironing': 'Off.', top: 'Every flat top.', topmost: 'Only the very top.', solid: 'Every solid layer, rarely useful.'},
  };

  S.ironing_pattern = {
    title: 'Ironing pattern',
    explain: () => `<p>The path the nozzle takes while ironing. <b>Rectilinear</b> goes back and forth in straight lines. <b>Concentric</b> follows the outline in shrinking loops, which suits round tops.</p>`,
    effects: (ctx, v) => v === 'concentric' ? [['Looks', 'Rings that follow the shape: nice on circles, odd on long rectangles.']] : [['Looks', 'Straight, even lines: suits most shapes.']],
    notes: {rectilinear: 'Back and forth.', concentric: 'Rings following the shape.'},
  };

  S.ironing_flow = {
    title: 'Ironing flow',
    explain: () => `<p>How much plastic is pushed out while ironing, as a % of a normal layer. Just enough is needed to fill the grooves. Too little leaves them partly open; too much overflows and the surface turns rough or shows a raised edge.</p>`,
    picture: (ctx, v) => iron('top', v, ctx.values.ironing_spacing),
    effects: (ctx, v) => { const f = num(v); return [['Looks', f < 6 ? 'Grooves partly remain.' : f <= 15 ? 'Grooves fill: a smooth face.' : f <= 25 ? 'Can overflow; good only if the top was under-filled.' : warn('Too much plastic: rough, smeared tops.')]]; },
    choices: () => [{value: '10%', label: '10%', note: 'The default.'}, {value: '15%', label: '15%', note: 'If grooves still show.'}, {value: '7%', label: '7%', note: 'If it looks smeared.'}],
  };

  S.ironing_spacing = {
    title: 'Ironing line spacing',
    explain: () => `<p>How far apart the ironing passes are. They are much closer than normal lines, so the nozzle's flat tip overlaps each pass. Closer passes give a smoother result but take longer.</p>`,
    effects: (ctx, v) => { const s = num(v); return [['Looks', s <= 0.1 ? 'Overlapping passes: smooth.' : s <= 0.2 ? 'A fine pattern may remain.' : 'Visible ironing lines.'], ['Time', `About ${round(0.1 / Math.max(s, 0.01), 1)}× the time of the 0.1 mm default.`]]; },
    choices: () => [{value: '0.1', label: '0.1 mm', note: 'The default.'}, {value: '0.15', label: '0.15 mm', note: 'Quicker.'}, {value: '0.08', label: '0.08 mm', note: 'Smoothest.'}],
  };

  S.ironing_inset = {
    title: 'Ironing inset',
    explain: ctx => `<p>How far from the edge of the top the ironing stays. Going right to the edge can drag plastic over it and round it; staying in leaves a thin unironed border. 0 uses half the nozzle (${mm(ctx.nozzle / 2)}).</p>`,
    effects: (ctx, v) => [['Looks', num(v) === 0 ? 'Irons close to the edge.' : `A ${mm(num(v))} unironed border.`]],
    choices: () => [{value: '0', label: 'Automatic', note: 'Half the nozzle.'}, {value: '0.4', label: '0.4 mm', note: 'Keep edges crisp.'}],
  };

  S.ironing_angle = {
    title: 'Ironing angle offset',
    explain: () => `<p>Turns the ironing lines by this angle compared with the top layer's lines. Crossing them (for example 90°) smooths the ridges better than going along them.</p>`,
    effects: (ctx, v) => [['Looks', num(v) % 180 === 0 ? 'Along the top lines.' : 'Across the top lines: often smoother.']],
    choices: () => [{value: '0', label: '0°', note: 'The default.'}, {value: '45', label: '45°', note: 'Diagonal.'}, {value: '90', label: '90°', note: 'Across.'}],
  };

  S.ironing_angle_fixed = {
    title: 'Fixed ironing angle',
    explain: () => `<p>On, the ironing angle above is an absolute direction on the bed instead of being relative to the top layer's lines. Useful when you want every part's shine to run the same way.</p>`,
    notes: {'1': 'The same direction on every top.', '0': 'Relative to the top lines.'},
  };

  S.ironing_expansion = {
    title: 'Ironing expansion',
    explain: () => `<p>Grows (positive) or shrinks (negative) the ironed area by this much. Used with Z contouring to reach up to the edges of sloped tops.</p>`,
    effects: (ctx, v) => [['Area', num(v) === 0 ? 'As detected.' : num(v) > 0 ? 'Irons a little further out.' : 'Stays further in.']],
  };

  // A sloped top surface: stepped layers, or layers that follow the slope.
  function slope(enabled, caption) {
    let body = text(20, 24, 'A gently sloped top seen from the side, enlarged');
    const x0 = 80, y0 = 200, steps = 6, sw = 100, sh = 20;
    for (let i = 0; i < steps; ++i) body += rect(x0 + i * sw, y0 - (i + 1) * sh, sw * (steps - i), sh - 1, C.plastic, {rx: 2});
    body += line(x0, y0 - sh * 0.5, x0 + steps * sw, y0 - steps * sh - sh * 0.5, C.text, {dash: '6 4'});
    if (enabled) {
      body += `<path d="M${x0},${y0 - 2} ${Array.from({length: steps}, (_, i) => `L${x0 + i * sw},${y0 - (i + 1) * sh} L${x0 + (i + 1) * sw},${y0 - (i + 1.5) * sh}`).join(' ')}" fill="none" stroke="${C.warm}" stroke-width="4"/>`;
      body += text(x0, y0 + 30, 'Gold: the top lines are tilted in Z to follow the slope, so the steps blend away', {fill: C.warm});
    } else body += text(x0, y0 + 30, 'Each layer is flat, so the slope comes out as a staircase', {fill: C.muted});
    return svg(760, 250, body, caption);
  }

  window.SECTIONS['Z contouring'] = {
    intro: () => `<p>A gentle slope on the top of a part comes out as a staircase, because every layer is flat. <b>Z contouring</b> (also called Z anti-aliasing) moves the nozzle up and down within the top layers, so the topmost lines follow the true slope and the steps blend away.</p>
      <p>It is experimental and needs a printer whose Z moves quickly and accurately.</p>`,
  };

  S.zaa_enabled = {
    title: 'Z contouring',
    explain: () => `<p>Turns Z contouring on. The top layers of sloped surfaces are printed with the nozzle rising and falling to trace the slope.</p>`,
    picture: (ctx, v) => slope(on(v)),
    effects: (ctx, v) => on(v) ? [['Looks', 'Smoother gentle slopes, fewer visible steps.'], ['Risk', 'Experimental; lots of small Z moves.'], ['Time', 'Slightly longer.']] : [['Looks', 'Sloped tops show layer steps.']],
    notes: {'1': 'Follow the slope.', '0': 'Flat layers.'},
  };

  S.zaa_minimize_perimeter_height = {
    title: 'Minimize wall height angle',
    explain: () => `<p>On slopes steeper than this angle, the walls at the top edge are lowered to match the model's edge, so they don't stick up above the contoured surface. 0 turns it off.</p>`,
    effects: (ctx, v) => [['Looks', num(v) === 0 ? 'Top-edge walls keep full height and may show a lip.' : 'A cleaner edge on sloped tops.']],
    choices: () => [{value: '35', label: '35°', note: 'The default.'}, {value: '0', label: 'Off', note: ''}],
  };

  S.zaa_min_z = {
    title: 'Minimum Z height',
    explain: () => `<p>The thinnest a contoured layer may get. Below this the nozzle can't push plastic out reliably.</p>`,
    effects: (ctx, v) => [['Looks', num(v) < 0.04 ? 'Very thin layers: finer, but can come out patchy.' : 'Reliable.']],
    choices: () => [{value: '0.05', label: '0.05 mm', note: 'The default.'}, {value: '0.08', label: '0.08 mm', note: 'Safer.'}],
  };

  S.zaa_dont_alternate_fill_direction = {
    title: 'Don\'t alternate fill direction',
    explain: () => `<p>Normally each top layer's lines cross the previous one. With Z contouring, keeping them all in one direction can give a more even look on the slope.</p>`,
    notes: {'1': 'All lines one way.', '0': 'Alternate as usual.'},
  };
})();
