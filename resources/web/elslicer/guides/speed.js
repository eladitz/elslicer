// Settings guide: the Speed tab.
(() => {
  const {C, num, length, on, round, mm, svg, text, rect, line, warn, bars} = G;
  const S = window.SETTINGS;
  const lh = ctx => num(ctx.values.layer_height) || 0.2;
  const widthOf = (ctx, key) => {
    const w = length(ctx.values[key] ?? 0, ctx.nozzle);
    if (w > 0) return w;
    const d = length(ctx.values.line_width ?? 0, ctx.nozzle);
    return d > 0 ? d : 1.125 * ctx.nozzle;
  };
  // A speed that may be a % of another speed: in mm/s.
  const resolve = (ctx, v, baseKey) => G.isPercent(v) ? num(v) / 100 * (num(ctx.values[baseKey]) || 0) : num(v);

  // How much plastic per second a line role needs at a speed, compared to the filament's limit.
  function flowCheck(ctx, speed, widthKey, height) {
    const need = widthOf(ctx, widthKey) * (height || lh(ctx)) * speed, limit = num(ctx.max_volumetric_speed);
    const out = `${round(need, 1)} mm³ of plastic a second at ${round(speed, 0)} mm/s`;
    if (!(limit > 0)) return ['Plastic per second', out + '.'];
    return ['Plastic per second', need > limit ? warn(`${out}: more than ${ctx.filament || 'your filament'}'s limit of ${round(limit, 1)} mm³/s, so the printer will slow down to about ${round(limit / (widthOf(ctx, widthKey) * (height || lh(ctx))), 0)} mm/s.`) : `${out}, within ${ctx.filament || 'your filament'}'s limit of ${round(limit, 1)} mm³/s.`];
  }

  // The chosen speed next to the others, so it's clear where it sits.
  const ROLES = [['outer_wall_speed', 'Outer wall'], ['inner_wall_speed', 'Inner wall'], ['top_surface_speed', 'Top surface'], ['sparse_infill_speed', 'Sparse infill'], ['internal_solid_infill_speed', 'Solid infill'], ['travel_speed', 'Travel']];
  function compare(ctx, key, v, title) {
    const items = ROLES.map(([k, label]) => ({label, value: k === key ? num(v) : num(ctx.values[k]) || 0, lit: k === key}));
    if (!ROLES.some(([k]) => k === key)) items.unshift({label: title, value: num(v), lit: true});
    return bars(items.map(i => ({...i, shown: `${round(i.value, 0)} mm/s`})), {title: 'Your speeds side by side (mm/s)'});
  }

  const speed = (key, title, o) => S[key] = {
    title,
    explain: ctx => `<p>${o.what}</p>${o.why || ''}`,
    picture: (ctx, v) => compare(ctx, key, o.base ? resolve(ctx, v, o.base) : v, title),
    effects: (ctx, v) => {
      const s = o.base ? resolve(ctx, v, o.base) : num(v);
      const list = [['Quality', o.quality(s, ctx)]];
      if (o.width) list.push(flowCheck(ctx, s, o.width, o.height && o.height(ctx)));
      if (o.time) list.push(['Time', o.time]);
      return list;
    },
    choices: o.choices,
    exact: o.base ? () => ({min: 1, max: '', unit: 'mm/s or %'}) : undefined,
  };
  const picks = list => () => list.map(([v, note]) => ({value: String(v), label: String(v).endsWith('%') ? v : `${v} mm/s`, note}));

  // ---- First layer
  window.SECTIONS['First layer speed'] = {
    intro: () => `<p>The first layer decides whether the print sticks to the bed, so it is printed slowly: slow lines have time to be pressed into the bed and grip it. Once a print comes loose, it's ruined, so this is the last place to save time.</p>`,
  };
  speed('initial_layer_speed', 'First layer', {
    what: 'The speed of the walls and brim on the first layer: the outline that holds the print down.',
    quality: s => s <= 30 ? 'Slow and sure: the best grip.' : s <= 60 ? 'Good on a clean, level bed.' : 'Fast: corners and small parts may not stick.',
    width: 'initial_layer_line_width', height: ctx => num(ctx.values.initial_layer_print_height) || lh(ctx),
    choices: picks([[20, 'Very sure.'], [30, 'Usual.'], [50, 'Fast printers, good beds.']]),
  });
  speed('initial_layer_infill_speed', 'First layer infill', {
    what: 'The speed of everything else on the first layer: the solid fill between the walls.',
    quality: s => s <= 60 ? 'Fills the first layer evenly.' : 'Faster; lines may not press in fully.',
    width: 'initial_layer_line_width', height: ctx => num(ctx.values.initial_layer_print_height) || lh(ctx),
    choices: picks([[40, 'Careful.'], [60, 'Usual.'], [100, 'Fast.']]),
  });
  S.initial_layer_travel_speed = {
    title: 'First layer travel speed',
    explain: () => `<p>How fast the nozzle moves without printing on the first layer. As a %, of the travel speed. A slower move is less likely to knock a freshly laid line loose.</p>`,
    choices: () => [{value: '100%', label: '100%', note: 'Same as travel.'}, {value: '50%', label: '50%', note: 'Gentler.'}],
    exact: () => ({min: 1, max: '', unit: 'mm/s or %'}),
  };
  S.slow_down_layers = {
    title: 'Number of slow layers',
    explain: () => `<p>After the first layer, speed rises gradually over this many layers to full speed, instead of jumping straight up. It helps tall, narrow or warp-prone prints settle on the bed.</p>`,
    effects: (ctx, v) => [['Sticking', num(v) === 0 ? 'Full speed from layer 2.' : `Speed ramps up over ${num(v)} layers.`], ['Time', 'A little more for each slow layer.']],
    choices: () => [{value: '0', label: 'Off', note: 'Default.'}, {value: '3', label: '3 layers', note: 'Gentle start.'}],
  };

  // ---- Other layers
  window.SECTIONS['Other layers speed'] = {
    intro: ctx => `<p>How fast each kind of line is printed after the first layer. Visible lines (the outer wall and top surface) are printed slower for looks; hidden lines (inner walls, infill) can go fast.</p>
      <p>Speed has a hard limit: the hot end can only melt so much plastic a second. ${num(ctx.max_volumetric_speed) > 0 ? `For ${ctx.filament || 'your filament'} that is ${round(num(ctx.max_volumetric_speed), 1)} mm³/s.` : ''} If a speed needs more, the printer slows down to fit, so raising it further does nothing.</p>`,
  };
  speed('outer_wall_speed', 'Outer wall', {
    what: 'The speed of the outermost wall, the surface you see. Slower gives a smoother, more even surface and sharper corners; faster can show ringing (ripples after corners) and an uneven sheen.',
    quality: s => s <= 60 ? 'The best surface.' : s <= 150 ? 'Good on a tuned printer.' : 'Fast: ripples after corners and a less even surface are likely.',
    width: 'outer_wall_line_width', choices: picks([[60, 'Best looks.'], [120, 'Balanced.'], [200, 'Fast.']]),
  });
  speed('inner_wall_speed', 'Inner wall', {
    what: 'The speed of the hidden walls behind the outer one. They don\'t show, so they can be faster than the outer wall.',
    quality: s => s > 300 ? 'Very fast: watch for weak layer bonds.' : 'No visible effect.',
    width: 'inner_wall_line_width', choices: picks([[100, 'Careful.'], [200, 'Usual.'], [300, 'Fast.']]),
  });
  S.small_perimeter_speed = {
    title: 'Small perimeters',
    explain: () => `<p>The speed for very small loops, like small holes and thin pegs. They have little time to cool between layers and can melt into blobs, so they print slower. As a %, of the outer wall speed.</p>`,
    effects: (ctx, v) => [['Speed', `${round(resolve(ctx, v, 'outer_wall_speed'), 0)} mm/s on small loops.`], ['Quality', 'Slower is cleaner on tiny features.']],
    choices: () => [{value: '50%', label: '50%', note: 'Default.'}, {value: '30%', label: '30%', note: 'Tiny details.'}],
    exact: () => ({min: 1, max: '', unit: 'mm/s or %'}),
  };
  S.small_perimeter_threshold = {
    title: 'Small perimeters threshold',
    explain: () => `<p>Loops with a radius up to this size count as "small" and use the speed above. 0 uses the built-in size (about 6.5 mm radius).</p>`,
    choices: () => [{value: '0', label: 'Automatic', note: 'Default.'}, {value: '5', label: '5 mm', note: ''}],
  };
  speed('sparse_infill_speed', 'Sparse infill', {
    what: 'The speed of the hidden infill pattern. It is often the fastest print move, because nobody sees it.',
    quality: s => s > 300 ? 'Very fast: the infill may bond weakly to the walls.' : 'No visible effect.',
    width: 'sparse_infill_line_width', time: 'Infill is a big share of most prints, so this changes the total time a lot.',
    choices: picks([[150, 'Careful.'], [250, 'Usual.'], [350, 'Fast.']]),
  });
  speed('internal_solid_infill_speed', 'Internal solid infill', {
    what: 'The speed of the hidden solid layers under the top and over the bottom.',
    quality: () => 'Hidden; affects how flat the base for the top is.',
    width: 'internal_solid_infill_line_width', choices: picks([[150, 'Careful.'], [250, 'Usual.']]),
  });
  speed('top_surface_speed', 'Top surface', {
    what: 'The speed of the top faces. Slower gives a smoother, more even top with tightly closed lines.',
    quality: s => s <= 100 ? 'A smooth, even top.' : s <= 200 ? 'Good.' : 'Fast: the line pattern shows more.',
    width: 'top_surface_line_width', choices: picks([[80, 'Smoothest.'], [150, 'Balanced.'], [200, 'Fast.']]),
  });
  speed('gap_infill_speed', 'Gap infill', {
    what: 'The speed for gap fill, the thin lines of uneven width in narrow gaps. Uneven lines are hard to print fast.',
    quality: s => s <= 50 ? 'Clean gap fill.' : 'Gap fill may come out patchy.',
    width: 'line_width', choices: picks([[30, 'Default.'], [50, 'Faster.']]),
  });
  S.ironing_speed = {
    title: 'Ironing speed',
    explain: () => `<p>How fast the nozzle moves while ironing. Slow ironing gives the heat time to smooth the surface.</p>`,
    effects: (ctx, v) => [['Quality', num(v) <= 30 ? 'Smooth, well-melted surface.' : 'Less smoothing.'], ['Time', 'Ironing at low speed over a large top takes a while.']],
    choices: picks([[15, 'Smoothest.'], [20, 'Default.'], [40, 'Quicker.']]),
  };
  speed('support_speed', 'Support', {
    what: 'The speed of support structures. They are removed afterwards, so they can be fast.',
    quality: s => s > 200 ? 'Fast supports can wobble on tall columns.' : 'Fine.',
    width: 'support_line_width', choices: picks([[80, 'Default.'], [150, 'Fast.']]),
  });
  speed('support_interface_speed', 'Support interface', {
    what: 'The speed of the dense support layers that touch the part. Slower gives a cleaner surface underneath the part.',
    quality: s => s <= 80 ? 'A cleaner underside.' : 'Faster; the underside may be rougher.',
    width: 'support_line_width', choices: picks([[50, 'Cleaner.'], [80, 'Default.']]),
  });
  S.small_support_perimeter_speed = {
    title: 'Small support perimeters',
    explain: () => `<p>The same as small perimeters, but for thin support columns. As a %, of the support speed.</p>`,
    choices: () => [{value: '50%', label: '50%', note: 'Default.'}],
    exact: () => ({min: 1, max: '', unit: 'mm/s or %'}),
  };
  S.small_support_perimeter_threshold = {title: 'Small support perimeters threshold', explain: () => `<p>Support loops up to this size are "small". 0 uses the built-in size.</p>`};

  // ---- Overhangs
  window.SECTIONS['Overhang speed'] = {
    intro: () => `<p>A wall line that hangs partly over air needs time to cool before it droops. These settings slow such lines down, more the further they overhang: 10% means a tenth of the line's width is over air, 100% means it is fully over air (a bridge).</p>`,
  };
  S.enable_overhang_speed = {
    title: 'Slow down for overhangs',
    explain: () => `<p>Turns overhang slowdown on. Without it, overhanging walls print at full speed and droop.</p>`,
    effects: (ctx, v) => on(v) ? [['Overhangs', 'Cleaner overhangs.']] : [['Overhangs', warn('Overhangs print at full wall speed.')]],
    notes: {'1': 'Recommended.', '0': 'Full speed on overhangs.'},
  };
  S.slowdown_for_curled_perimeters = {
    title: 'Slow down for curled perimeters',
    explain: () => `<p>Overhangs on sharp corners tend to curl upwards a little, and each layer makes it worse, like the bow of a boat model. On, Elslicer predicts where the wall has curled and slows down there so it settles.</p>`,
    effects: (ctx, v) => on(v) ? [['Overhangs', 'Less curling on corners.'], ['Risk', 'Big speed changes can leave marks on fast walls; use extrusion rate smoothing.']] : [['Overhangs', 'Curling may build up on sharp overhanging corners.']],
    notes: {'1': 'Recommended unless cooling is strong.', '0': 'Off.'},
  };
  const overhang = (key, share, next) => speed(key, `${share} overhang`, {
    what: `The speed for wall lines that overhang between ${share} and ${next} of their width. 0 keeps the normal wall speed. As a %, of the wall speed.`,
    base: 'outer_wall_speed',
    quality: s => s === 0 ? 'Normal wall speed.' : s <= 30 ? 'Slow: these lines hold their shape.' : 'Moderate.',
    choices: picks([[0, 'Wall speed.'], ...(share === '10%' ? [[100, ''], ['80%', '']] : share === '25%' ? [[60, ''], ['50%', '']] : share === '50%' ? [[30, ''], ['30%', '']] : [[15, ''], ['15%', '']])]),
  });
  overhang('overhang_1_4_speed', '10%', '25%');
  overhang('overhang_2_4_speed', '25%', '50%');
  overhang('overhang_3_4_speed', '50%', '75%');
  overhang('overhang_4_4_speed', '75%', '100%');
  speed('bridge_speed', 'External bridge', {
    what: 'The speed of bridges you can see, printed across air. Slow bridges cool and stiffen as they go, so they sag less.',
    quality: s => s <= 30 ? 'Neat, well-cooled bridges.' : 'Faster bridges sag more.', width: 'bridge_line_width',
    choices: picks([[20, 'Careful.'], [25, 'Default.'], [50, 'Fast printers with strong fans.']]),
  });
  S.internal_bridge_speed = {
    title: 'Internal bridge',
    explain: () => `<p>The speed of hidden bridges over infill. As a %, of the external bridge speed.</p>`,
    effects: (ctx, v) => [['Speed', `${round(resolve(ctx, v, 'bridge_speed'), 0)} mm/s.`]],
    choices: () => [{value: '150%', label: '150%', note: 'Default.'}, {value: '100%', label: '100%', note: 'Same as bridges.'}],
    exact: () => ({min: 1, max: '', unit: 'mm/s or %'}),
  };

  // ---- Travel
  window.SECTIONS['Travel speed'] = {intro: () => `<p>Travel moves are when the nozzle moves without printing, from one spot to the next.</p>`};
  S.travel_speed = {
    title: 'Travel',
    explain: () => `<p>How fast the nozzle moves when not printing. Faster travel saves time and gives the nozzle less time to ooze, so there are fewer strings between parts. The printer's own limits cap it.</p>`,
    picture: (ctx, v) => compare(ctx, 'travel_speed', v),
    effects: (ctx, v) => [['Strings', num(v) >= 200 ? 'Quick moves: little time to ooze.' : 'Slower moves can leave more strings.'], ['Time', 'Many short moves: a small but real saving.']],
    choices: picks([[150, 'Older printers.'], [300, 'Usual.'], [500, 'Fast printers.']]),
  };

  // ---- Acceleration
  // How a 20 mm line speeds up and slows down at an acceleration.
  function ramp(ctx, accel, speed, label) {
    const a = Math.max(1, accel), v = Math.max(1, speed), d = 20;
    const dAccel = v * v / (2 * a), reached = 2 * dAccel < d, peak = reached ? v : Math.sqrt(a * d);
    const x0 = 80, W = 600, y0 = 210, H = 150, sx = W / d, sy = H / Math.max(v, 1);
    const ramp = Math.min(d / 2, dAccel);
    let body = text(20, 24, `${label}: speed along one 20 mm line (up is faster)`);
    body += line(x0, y0, x0 + W, y0, C.faint) + line(x0, y0, x0, y0 - H - 10, C.faint);
    body += line(x0, y0 - v * sy, x0 + W, y0 - v * sy, C.muted, {dash: '5 4'}) + text(x0 + W + 6, y0 - v * sy + 4, `${round(v, 0)} mm/s set`, {size: 12});
    body += `<polygon points="${x0},${y0} ${x0 + ramp * sx},${y0 - peak * sy} ${x0 + (d - ramp) * sx},${y0 - peak * sy} ${x0 + W},${y0}" fill="${C.accent}" opacity="0.8"/>`;
    body += text(x0 + W / 2, y0 + 24, reached ? `Reaches full speed after ${mm(ramp)}` : warn(`Never reaches ${round(v, 0)} mm/s: tops out at ${round(peak, 0)} mm/s`), {anchor: 'middle', fill: reached ? C.text : C.warm});
    return svg(760, 250, body);
  }
  window.SECTIONS['Acceleration'] = {
    intro: () => `<p>The printer can't jump to full speed: the print head speeds up and slows down at a set rate, the <b>acceleration</b>, in mm/s². High acceleration reaches speed quickly and saves time on short lines; but every sudden start and stop shakes the printer, and the shaking shows as ripples ("ringing") on the walls after corners.</p>
      <p>On short lines, acceleration matters more than the speed setting, because the head never reaches full speed.</p>`,
  };
  const accel = (key, title, speedKey, what, choices) => S[key] = {
    title,
    explain: () => `<p>${what}</p>`,
    picture: speedKey ? (ctx, v) => ramp(ctx, G.isPercent(v) ? num(v) / 100 * (num(ctx.values[key === 'bridge_acceleration' ? 'outer_wall_acceleration' : 'default_acceleration']) || 1000) : num(v), num(ctx.values[speedKey]) || 100, title) : undefined,
    effects: (ctx, v) => { const a = G.isPercent(v) ? null : num(v); return a == null ? [['Note', 'As a share of another acceleration.']] : [['Quality', a === 0 ? 'Uses the printer\'s own setting.' : a <= 2000 ? 'Gentle: the least ringing.' : a <= 6000 ? 'Moderate.' : 'High: fast, but ringing may show on visible walls.'], ['Time', a <= 2000 ? 'Slower on short lines.' : 'Short lines get up to speed quickly.']]; },
    choices: () => choices.map(([v, note]) => ({value: String(v), label: String(v).endsWith('%') ? v : `${v} mm/s²`, note})),
    exact: () => ({min: 0, max: '', unit: 'mm/s² or %'}),
  };
  accel('default_acceleration', 'Normal printing', 'inner_wall_speed', 'The acceleration used for anything not set separately below.', [[2000, 'Gentle.'], [5000, 'Usual for fast printers.'], [10000, 'Aggressive.']]);
  accel('outer_wall_acceleration', 'Outer wall', 'outer_wall_speed', 'The acceleration of the outer wall. Lower gives a smoother surface with less ringing.', [[1000, 'Best surface.'], [3000, 'Balanced.'], [5000, 'Fast.']]);
  accel('inner_wall_acceleration', 'Inner wall', 'inner_wall_speed', 'The acceleration of hidden inner walls. They don\'t show, so it can be higher.', [[5000, ''], [10000, '']]);
  accel('bridge_acceleration', 'Bridge', 'bridge_speed', 'The acceleration of bridges. As a %, of the outer wall acceleration. Gentle acceleration doesn\'t jerk the hanging strands.', [['50%', 'Default.'], ['100%', '']]);
  accel('sparse_infill_acceleration', 'Sparse infill', 'sparse_infill_speed', 'The acceleration of infill. As a %, of normal printing.', [['100%', 'Default.'], [10000, 'Fast.']]);
  accel('internal_solid_infill_acceleration', 'Internal solid infill', 'internal_solid_infill_speed', 'The acceleration of hidden solid layers. As a %, of normal printing.', [['100%', 'Default.']]);
  accel('initial_layer_acceleration', 'First layer', 'initial_layer_speed', 'The acceleration on the first layer. Low values stop sharp moves from tugging fresh lines off the bed.', [[300, 'Default.'], [500, ''], [1000, '']]);
  accel('initial_layer_travel_acceleration', 'First layer travel', null, 'The travel acceleration on the first layer. As a %, of travel acceleration.', [['100%', 'Default.'], ['50%', 'Gentler.']]);
  accel('top_surface_acceleration', 'Top surface', 'top_surface_speed', 'The acceleration of top faces. Lower gives a more even top.', [[1000, 'Smoothest.'], [2000, ''], [5000, '']]);
  accel('travel_acceleration', 'Travel', 'travel_speed', 'The acceleration of non-printing moves. High travel acceleration saves a lot of time; too high can make the printer skip steps and shift layers.', [[5000, ''], [10000, 'Usual.'], [20000, 'Aggressive.']]);
  S.accel_to_decel_enable = {
    title: 'Enable accel_to_decel',
    explain: () => `<p>For Klipper printers: also sets how quickly the head slows down on short zigzags (max_accel_to_decel) as a share of the acceleration. Softer slowing reduces ringing on zigzag fill.</p>`,
    notes: {'1': 'Set it automatically.', '0': 'Leave the printer\'s value.'},
  };
  S.accel_to_decel_factor = {
    title: 'accel_to_decel',
    explain: () => `<p>The share of the acceleration used for slowing down on zigzags. 50% is Klipper's usual.</p>`,
    choices: () => [{value: '50%', label: '50%', note: 'Default.'}],
  };

  // ---- Junction deviation and jerk
  window.SECTIONS['Junction Deviation'] = {intro: () => `<p>How fast the head may take a corner without stopping, on Marlin printers that use Junction Deviation instead of jerk.</p>`};
  S.default_junction_deviation = {
    title: 'Junction deviation',
    explain: () => `<p>Larger values let the head go round corners faster: quicker prints, but more ringing and rounder corners. 0 leaves the printer's own value.</p>`,
    effects: (ctx, v) => [['Corners', num(v) === 0 ? 'The printer\'s own value.' : num(v) <= 0.02 ? 'Careful, crisp corners.' : 'Fast corners; more ringing.']],
    choices: () => [{value: '0', label: 'Printer\'s value', note: ''}, {value: '0.013', label: '0.013 mm', note: 'Common.'}],
  };
  window.SECTIONS['Jerk(XY)'] = {
    intro: () => `<p><b>Jerk</b> is the speed at which the head may change direction instantly, without slowing down first. Higher jerk takes corners quicker but kicks the printer, causing ringing and blobs at corners. 0 leaves the printer's own values.</p>`,
  };
  const jerk = (key, title, note) => S[key] = {
    title,
    explain: () => `<p>${note}</p>`,
    effects: (ctx, v) => [['Corners', num(v) === 0 ? 'The printer\'s own value.' : num(v) <= 8 ? 'Gentle: clean corners.' : 'Quick corners: some ringing.']],
    choices: () => [{value: '0', label: 'Printer\'s value', note: ''}, {value: '8', label: '8 mm/s', note: 'Gentle.'}, {value: '12', label: '12 mm/s', note: 'Quicker.'}],
    exact: key === 'initial_layer_travel_jerk' ? () => ({min: 0, max: '', unit: 'mm/s or %'}) : undefined,
  };
  jerk('default_jerk', 'Default jerk', 'The jerk used for anything not set below. 0 means the printer\'s own setting, and disables the others.');
  jerk('outer_wall_jerk', 'Outer wall jerk', 'The jerk on the outer wall; lower gives cleaner corners.');
  jerk('inner_wall_jerk', 'Inner wall jerk', 'The jerk on hidden walls.');
  jerk('infill_jerk', 'Infill jerk', 'The jerk on infill.');
  jerk('top_surface_jerk', 'Top surface jerk', 'The jerk on top faces.');
  jerk('initial_layer_jerk', 'First layer jerk', 'The jerk on the first layer.');
  jerk('initial_layer_travel_jerk', 'First layer travel jerk', 'The travel jerk on the first layer, or a % of the travel jerk.');
  jerk('travel_jerk', 'Travel jerk', 'The jerk for non-printing moves.');

  // ---- Advanced
  window.SECTIONS['Speed/Advanced'] = {
    intro: () => `<p>When the printer jumps from a fast line to a slow one, the hot end can't change the flow of plastic instantly: the leftover pressure leaves a bulge, and the reverse leaves a thin spot. <b>Extrusion rate smoothing</b> eases these changes over a short distance.</p>`,
  };
  S.max_volumetric_extrusion_rate_slope = {
    title: 'Extrusion rate smoothing',
    explain: () => `<p>The fastest the flow of plastic may change, in mm³/s every second. Lower is smoother but makes speed changes take longer. 0 turns it off. It helps most on printers where speeds vary a lot between kinds of line.</p>`,
    effects: (ctx, v) => [['Quality', num(v) === 0 ? 'Off: bulges are possible where speed changes.' : num(v) <= 100 ? 'Very smooth transitions.' : 'Light smoothing.'], ['Time', num(v) > 0 && num(v) < 100 ? 'A bit slower.' : 'No real change.']],
    choices: () => [{value: '0', label: 'Off', note: ''}, {value: '300', label: '300', note: 'Light.'}, {value: '100', label: '100', note: 'Strong.'}],
  };
  S.max_volumetric_extrusion_rate_slope_segment_length = {
    title: 'Smoothing segment length',
    explain: () => `<p>Smoothing splits lines into short pieces of this length, each a little faster or slower. Shorter pieces are smoother but make bigger files; raise it if the printer stutters.</p>`,
    choices: () => [{value: '3', label: '3 mm', note: 'Default.'}, {value: '1', label: '1 mm', note: 'Smoother.'}],
  };
  S.extrusion_rate_smoothing_external_perimeter_only = {
    title: 'Apply only on external features',
    explain: () => `<p>Smooths only the outer walls and overhangs, where marks would show, and leaves hidden lines at full speed.</p>`,
    notes: {'1': 'Visible lines only.', '0': 'Everywhere.'},
  };
})();
