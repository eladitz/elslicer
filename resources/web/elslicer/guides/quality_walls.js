// Settings guide: the Wall generator and Walls and surfaces sections of the Quality tab.
(() => {
  const {C, num, length, on, round, mm, pct, svg, text, rect, line, bead, warn} = G;
  const S = window.SETTINGS;

  // A wedge that gets thinner, filled by fixed-width walls plus gap fill, or by walls that change width.
  function wedge(generator, caption) {
    const x0 = 60, x1 = 700, yMid = 135, hL = 90, hR = 10;
    let body = text(20, 24, 'A tapering wall seen from above, enlarged: how the space is filled with lines');
    body += `<polygon points="${x0},${yMid - hL} ${x1},${yMid - hR} ${x1},${yMid + hR} ${x0},${yMid + hL}" fill="${C.plastic2}"/>`;
    const at = (t, f) => yMid + f * (hL + (hR - hL) * t);
    if (generator === 'arachne') {
      // Lines whose width follows the space; they merge as it narrows.
      for (const f of [-0.75, -0.25, 0.25, 0.75]) body += `<path d="M${x0},${at(0, f)} L${x0 + 340},${at(0.53, f)}" stroke="${C.accent}" stroke-width="20" stroke-linecap="round" fill="none"/>`;
      for (const f of [-0.5, 0.5]) body += `<path d="M${x0 + 340},${at(0.53, f)} L${x0 + 560},${at(0.875, f)}" stroke="${C.accent}" stroke-width="16" stroke-linecap="round" fill="none"/>`;
      body += `<path d="M${x0 + 560},${yMid} L${x1},${yMid}" stroke="${C.accent}" stroke-width="12" stroke-linecap="round" fill="none"/>`;
      body += text(x0, 255, 'Arachne: lines widen and narrow to fit, and merge where the wall gets thin', {fill: C.text});
    } else {
      for (const f of [-0.78, -0.55, 0.55, 0.78]) body += `<path d="M${x0},${at(0, f)} L${x0 + 420},${at(0.65, f)}" stroke="${C.accent}" stroke-width="16" stroke-linecap="round" fill="none"/>`;
      body += `<path d="M${x0},${yMid - 22} L${x0 + 420},${yMid - 10} L${x0 + 420},${yMid + 10} L${x0},${yMid + 22}" fill="none" stroke="${C.warm}" stroke-width="3"/>`;
      for (let i = 0; i < 16; ++i) body += line(x0 + 440 + i * 14, yMid - 22 + i, x0 + 440 + i * 14, yMid + 22 - i, C.warm, {sw: 2});
      body += text(x0, 255, 'Classic: lines stay one width; the leftover gaps get zigzag "gap fill" (gold)', {fill: C.text});
    }
    return svg(760, 270, body, caption);
  }

  window.SECTIONS['Wall generator'] = {
    intro: () => `<p>Walls are the loops that form the outside of the part. When a wall in the model is not an exact multiple of the line width, or it tapers like a blade, there's leftover space between the loops.</p>
      <p>The <b>wall generator</b> decides how to fill it: with lines of one fixed width plus small zigzag fill in the gaps (Classic), or with lines that change width to fit the space exactly (Arachne). The rest of this section fine-tunes how Arachne does that.</p>`,
  };

  S.wall_generator = {
    title: 'Wall generator',
    explain: () => `<p><b>Arachne</b> lets each line get wider or narrower as needed, so thin and tapering walls are filled completely, with fewer stops and starts. It is the better choice for small text, thin fins and organic shapes.</p>
      <p><b>Classic</b> keeps every line the same width and fills what's left with "gap fill". It is very predictable, and some people prefer its look on simple boxy parts.</p>`,
    picture: (ctx, v) => wedge(v),
    effects: (ctx, v) => v === 'arachne' ? [['Looks', 'Thin features and small text come out fuller and cleaner.'], ['Strength', 'No weak gap fill in thin walls.'], ['Note', 'The width changes slightly along walls; rarely visible.']] :
      [['Looks', 'Even line width everywhere; thin parts may show zigzag gap fill or small holes.'], ['Strength', 'Thin walls are weaker where gap fill is used.']],
    notes: {classic: 'Fixed-width lines plus gap fill.', arachne: 'Lines that change width to fit.'},
  };

  S.wall_transition_angle = {
    title: 'Wall transitioning threshold angle',
    explain: () => `<p>When a wall narrows like a wedge, at some point there's room for one fewer line, and Arachne has to change from, say, 3 lines to 2. This angle decides on which wedges it bothers: on wedges sharper than this, it adds a short centre line to fill the middle; on blunter ones it doesn't.</p>`,
    effects: (ctx, v) => [['Looks', num(v) < 10 ? 'More centre lines: fuller tapering walls, more starts and stops.' : num(v) > 20 ? 'Fewer centre lines: a few small gaps in sharp corners.' : 'Balanced.']],
    choices: () => [{value: '10', label: '10°', note: 'The default.'}, {value: '15', label: '15°', note: 'Fewer transitions.'}],
  };

  S.wall_transition_filter_deviation = {
    title: 'Wall transitioning filter margin',
    explain: () => `<p>Stops Arachne flipping back and forth between one more and one fewer line when a wall's thickness hovers right on the edge. A bigger margin means fewer flips (fewer starts and stops) but lines may be stretched further from their ideal width.</p>`,
    effects: (ctx, v) => [['Looks', num(v) > 40 ? 'Fewer transitions; some lines quite wide or thin.' : 'Lines stay close to ideal width; more transitions.']],
    choices: () => [{value: '25%', label: '25%', note: 'The default.'}, {value: '40%', label: '40%', note: 'Fewer flips.'}],
  };

  S.wall_transition_length = {
    title: 'Wall transition length',
    explain: ctx => `<p>How long the stretch is where one line splits into two (or two merge into one). Longer transitions are smoother; shorter ones are more precise. As a % of the nozzle (${ctx.nozzle} mm).</p>`,
    effects: (ctx, v) => [['Looks', num(v) < 80 ? 'Abrupt changes in line count.' : 'Gentle changes.']],
    choices: () => [{value: '100%', label: '100%', note: 'The default.'}],
  };

  S.wall_distribution_count = {
    title: 'Wall distribution count',
    explain: () => `<p>When Arachne must widen or narrow lines, this many walls, counted from the middle, share the change. 1 means only the innermost line changes width, so the outer wall you see stays perfectly even.</p>`,
    effects: (ctx, v) => [['Looks', num(v) <= 1 ? 'The outer wall keeps a constant width: best surface.' : 'Changes are spread out, including into the outer wall.']],
    choices: () => [{value: '1', label: '1', note: 'The default; best looks.'}, {value: '2', label: '2', note: 'Spread over two.'}],
  };

  S.initial_layer_min_bead_width = {
    title: 'First layer minimum wall width',
    explain: ctx => `<p>The thinnest line Arachne may use on the first layer, as a % of the nozzle (${ctx.nozzle} mm). Thin lines stick poorly, so keep this near 100% for good grip on the bed.</p>`,
    effects: (ctx, v) => [['Sticking', num(v) >= 85 ? 'Thin first-layer details still stick.' : 'Very thin first-layer lines may not stick.']],
    choices: () => [{value: '85%', label: '85%', note: 'The default.'}, {value: '100%', label: '100%', note: 'Best grip.'}],
  };

  S.min_bead_width = {
    title: 'Minimum wall width',
    explain: ctx => `<p>The width given to a thin feature (one thinner than a normal line, but thicker than the Minimum feature size). As a % of the nozzle: 85% is ${mm(0.85 * ctx.nozzle)}.</p>`,
    effects: (ctx, v) => [['Looks', num(v) < 70 ? 'Very thin lines: closer to the model, but may come out patchy.' : 'Reliable thin features, slightly thicker than modelled.']],
    choices: () => [{value: '85%', label: '85%', note: 'The default.'}, {value: '100%', label: '100%', note: 'Sturdier.'}],
  };

  S.min_feature_size = {
    title: 'Minimum feature size',
    explain: ctx => `<p>Features thinner than this are dropped; thicker ones are printed at least at the Minimum wall width. As a % of the nozzle: 25% is ${mm(0.25 * ctx.nozzle)}.</p>
      <p>Lower values keep finer details like thin text strokes or hair, printed thicker than modelled.</p>`,
    effects: (ctx, v) => [['Detail', num(v) <= 15 ? 'Even very thin details survive (widened).' : num(v) <= 30 ? 'Thin details down to about a quarter of the nozzle survive.' : 'Fine details are dropped.']],
    choices: () => [{value: '25%', label: '25%', note: 'The default.'}, {value: '10%', label: '10%', note: 'Keep tiny details.'}, {value: '50%', label: '50%', note: 'Drop slivers.'}],
  };

  S.min_length_factor = {
    title: 'Minimum wall length',
    explain: () => `<p>Drops short, open wall pieces that would take longer to start and stop than they're worth. The value is a multiple of the line width; higher removes more and longer pieces. Top and bottom surfaces are never affected.</p>`,
    effects: (ctx, v) => [['Detail', num(v) <= 0.5 ? 'Keeps small wall fragments.' : 'Fewer small fragments: faster, but tiny details may vanish.']],
    choices: () => [{value: '0.5', label: '0.5', note: 'The default.'}, {value: '1', label: '1', note: 'Fewer fragments.'}],
  };

  S.wall_maximum_resolution = {
    title: 'Maximum wall resolution',
    explain: () => `<p>The shortest straight piece a wall line may be made of. Shorter pieces follow curves more exactly but produce more moves, which can make some printers stutter.</p>`,
    effects: (ctx, v) => [['Looks', num(v) <= 0.2 ? 'Very fine curves.' : 'Smooth to the eye.']],
    choices: () => [{value: '0.5', label: '0.5 mm', note: 'The default.'}, {value: '0.2', label: '0.2 mm', note: 'Finer.'}],
  };

  S.wall_maximum_deviation = {
    title: 'Maximum wall deviation',
    explain: () => `<p>How far a simplified wall may stray from the true shape. It overrides the resolution above: a short piece is kept if merging would stray more than this.</p>`,
    effects: (ctx, v) => [['Looks', num(v) <= 0.025 ? 'Faithful to the model.' : 'Slightly less accurate, smaller files.']],
    choices: () => [{value: '0.025', label: '0.025 mm', note: 'The default.'}, {value: '0.01', label: '0.01 mm', note: 'Closest.'}],
  };

  // Walls and surfaces.
  function order(seq, caption) {
    const labels = {'inner wall/outer wall': ['3', '2', '1'], 'outer wall/inner wall': ['1', '2', '3'], 'inner-outer-inner wall': ['2', '3', '1']}[seq] || ['3', '2', '1'];
    let body = text(20, 24, 'Three walls cut through, enlarged: the numbers are the order they print in');
    const x0 = 200, w = 90, h = 50, y = 150;
    ['outer', 'middle', 'inner'].forEach((name, i) => {
      body += bead(x0 + i * w * 0.95, y - h, w, h, i === 0 ? C.accent : C.plastic);
      body += text(x0 + i * w * 0.95 + w / 2, y - h / 2 + 6, labels[i], {anchor: 'middle', fill: C.text, size: 20, bold: true});
      body += text(x0 + i * w * 0.95 + w / 2, y + 22, name, {anchor: 'middle', size: 12});
    });
    body += text(120, y - h / 2 + 4, 'outside', {anchor: 'end'}) + text(x0 + 3 * w + 30, y - h / 2 + 4, 'inside of the part');
    return svg(760, 200, body, caption);
  }

  // A flat surface cut through with the chosen flow multiplier.
  function flow(ratio, label) {
    const r = Math.max(0.5, Math.min(1.5, num(ratio) || 1));
    let body = text(20, 24, `${label} cut through, enlarged`);
    const x0 = 80, w = 60, h = 30 * r, y = 150, n = 10;
    for (let i = 0; i < n; ++i) body += bead(x0 + i * w * (r > 1 ? 1 : 1 + (1 - r) * 0.4), y - h, w * Math.min(1.15, r), h, C.accent);
    body += line(60, y - 30, 720, y - 30, C.muted, {dash: '5 4'}) + text(724, y - 26, 'planned top', {size: 12});
    body += text(80, y + 40, r > 1.04 ? 'Too much plastic: lines bulge above the plan, ridges and blobs' : r < 0.96 ? 'Too little plastic: lines are thin with gaps between them' : 'Lines touch and fill the plan', {fill: r > 1.04 || r < 0.96 ? C.warm : C.text});
    return svg(760, 210, body);
  }
  const flowEffects = (v, what) => { const f = num(v); return [['Looks', f > 1.04 ? `More plastic in ${what}: can bulge or leave ridges.` : f < 0.96 ? `Less plastic in ${what}: may leave small gaps.` : 'Normal.'], ['How to tune', 'Change in small steps (0.02) and print a test.']]; };
  const flowChoices = () => [{value: '0.95', label: '0.95', note: 'Less plastic.'}, {value: '0.98', label: '0.98', note: 'A touch less.'}, {value: '1', label: '1', note: 'Normal.'}, {value: '1.02', label: '1.02', note: 'A touch more.'}];
  const flowRatio = (key, title, what, extra = '') => S[key] = {
    title,
    explain: () => `<p>Multiplies the plastic used for ${what}: 1 is normal, 0.95 is 5% less. It stacks on top of the filament's own flow ratio${key === 'print_flow_ratio' ? '' : ' and the overall Flow ratio'}.</p>${extra}`,
    picture: (ctx, v) => flow(v, title.replace(' flow ratio', '')),
    effects: (ctx, v) => flowEffects(v, what),
    choices: flowChoices,
  };

  window.SECTIONS['Walls and surfaces'] = {
    intro: () => `<p>A mix of settings about how walls and flat surfaces are laid down: the order walls print in, which way they go round, how much plastic each kind of line gets, and how the nozzle travels between them.</p>
      <p>Most matter for looks: a smooth outer wall, flat tops and no blobs. The flow ratios are for fine-tuning once a print shows too much or too little plastic in one place.</p>`,
  };

  S.wall_sequence = {
    title: 'Walls printing order',
    explain: () => `<p>Which wall loop prints first on each layer.</p>
      <p><b>Inner/Outer</b> prints the hidden walls first and the outer wall last, against them. Overhangs print best this way because the outer line has something to lean on, but it gets slightly pushed out of shape. <b>Outer/Inner</b> prints the outside first, so it lands exactly where planned: sharper dimensions, worse overhangs. <b>Inner/Outer/Inner</b> prints one inner wall, then the outer, then the rest: a clean outside without giving up as much on overhangs. It needs at least 3 walls.</p>`,
    picture: (ctx, v) => order(v),
    effects: (ctx, v) => ({
      'inner wall/outer wall': [['Looks', 'A good surface; slight ripple on detailed parts.'], ['Overhangs', 'The best: the outer line leans on the inner one.'], ['Accuracy', 'Normal.']],
      'outer wall/inner wall': [['Looks', 'The cleanest, most accurate outside.'], ['Overhangs', 'Weaker: the outer line has nothing beside it yet.'], ['Accuracy', 'The best.']],
      'inner-outer-inner wall': [['Looks', 'A clean outside.'], ['Overhangs', 'Better than Outer/Inner.'], ['Walls', (num(ctx.values.wall_loops) || 0) >= 3 ? 'You have enough walls for this.' : warn(`Needs 3 or more walls; you have ${ctx.values.wall_loops}.`)]],
    }[v] || []),
    notes: {'inner wall/outer wall': 'Best overhangs.', 'outer wall/inner wall': 'Best accuracy.', 'inner-outer-inner wall': 'Good looks and overhangs, 3+ walls.'},
  };

  S.is_infill_first = {
    title: 'Print infill first',
    explain: () => `<p>Normally each layer prints its walls first, then fills the inside. On, it fills the inside first and then the walls.</p>
      <p>This can help steep overhangs, because the walls have the infill to lean on. But the infill pushes the walls out where it touches them, and its pattern can show through on the outside.</p>`,
    effects: (ctx, v) => on(v) ? [['Looks', warn('The infill pattern can show through the outer walls.')], ['Overhangs', 'Slightly better.']] : [['Looks', 'Clean walls.'], ['Overhangs', 'Normal.']],
    notes: {'1': 'Infill, then walls.', '0': 'Walls, then infill (recommended).'},
  };

  S.wall_direction = {
    title: 'Wall loop direction',
    explain: () => `<p>Which way the outer loops go round, seen from above. Holes go the other way. It rarely matters; on some printers one direction gives slightly better corners or overhangs because of the cooling fan's side.</p>`,
    notes: {ccw: 'The default.', cw: 'The other way.'},
  };

  flowRatio('print_flow_ratio', 'Flow ratio', 'everything in this part',
    '<p>Use it when a whole print shows too much plastic (rough, ridged tops, sizes too big) or too little (gaps between lines, weak layers). The recommended range is 0.95 to 1.05.</p>');
  flowRatio('top_solid_infill_flow_ratio', 'Top surface flow ratio', 'the top surfaces', '<p>Lowering it slightly (0.95-0.98) often gives a smoother, flatter top.</p>');
  flowRatio('bottom_solid_infill_flow_ratio', 'Bottom surface flow ratio', 'the bottom surfaces');

  S.set_other_flow_ratios = {
    title: 'Set other flow ratios',
    explain: () => `<p>Shows separate flow ratios for each kind of line: first layer, walls, overhangs, infill, gap fill and supports. Leave it off unless one kind of line shows a specific problem.</p>`,
    notes: {'1': 'Show the per-line ratios.', '0': 'Use one ratio for all.'},
  };
  flowRatio('first_layer_flow_ratio', 'First layer flow ratio', 'the first layer', '<p>A little more (1.02-1.05) can help it stick and cover small bed dips.</p>');
  flowRatio('outer_wall_flow_ratio', 'Outer wall flow ratio', 'the outer walls');
  flowRatio('inner_wall_flow_ratio', 'Inner wall flow ratio', 'the inner walls');
  flowRatio('overhang_flow_ratio', 'Overhang flow ratio', 'overhanging walls');
  flowRatio('sparse_infill_flow_ratio', 'Sparse infill flow ratio', 'the sparse infill');
  flowRatio('internal_solid_infill_flow_ratio', 'Internal solid infill flow ratio', 'the hidden solid layers');
  flowRatio('gap_fill_flow_ratio', 'Gap fill flow ratio', 'gap fill');
  flowRatio('support_flow_ratio', 'Support flow ratio', 'supports');
  flowRatio('support_interface_flow_ratio', 'Support interface flow ratio', 'the support layers that touch the part');

  S.only_one_wall_first_layer = {
    title: 'Only one wall on first layer',
    explain: () => `<p>Prints just one wall loop on the first layer, leaving more room for the bottom fill pattern. Useful for patterned bottoms or very small parts.</p>`,
    effects: (ctx, v) => on(v) ? [['Looks', 'More of the bottom shows the fill pattern.'], ['Sticking', 'Edges have one loop instead of several.']] : [['Looks', 'A normal bottom with full walls.']],
    notes: {'1': 'One loop on layer 1.', '0': 'Normal walls.'},
  };

  S.only_one_wall_top = {
    title: 'Only one wall on top surfaces',
    explain: () => `<p>On flat tops, uses just one wall loop around the edge, so the top fill pattern covers more of the surface. It often looks cleaner on tops and avoids small gaps between loops and fill.</p>`,
    effects: (ctx, v) => on(v) ? [['Looks', 'A more uniform top, filled almost to the edge.']] : [['Looks', 'Several wall loops frame each top.']],
    notes: {'1': 'One loop on tops.', '0': 'All walls on tops.'},
  };

  S.min_width_top_surface = {
    title: 'One wall threshold',
    explain: () => `<p>Decides what counts as a top surface for the option above: narrow strips under this width aren't treated as tops, so they keep their full walls. In mm or a % of the wall line width.</p>
      <p>If thin features on the next layer, like letters, leave marks, set it to 0.</p>`,
    effects: (ctx, v) => [['Which tops', num(v) === 0 ? 'Every top counts.' : 'Narrow strips keep all their walls.']],
    choices: () => [{value: '300%', label: '300%', note: 'The default.'}, {value: '0', label: '0', note: 'Fixes marks under letters.'}],
    exact: () => ({min: 0, max: '', unit: 'mm or %'}),
  };

  S.reduce_crossing_wall = {
    title: 'Avoid crossing walls',
    explain: () => `<p>When the nozzle moves between two spots, it normally goes in a straight line, possibly over the outer wall. Any drip on the tip can leave a small blob or string there. On, it routes the move around inside the part instead.</p>`,
    effects: (ctx, v) => on(v) ? [['Looks', 'Fewer blobs and strings on the outside.'], ['Time', 'Slightly longer travel.']] : [['Looks', 'Straight moves may leave marks on walls.'], ['Time', 'Shortest travel.']],
    notes: {'1': 'Route around walls.', '0': 'Straight moves.'},
  };

  S.max_travel_detour_distance = {
    title: 'Max detour length',
    explain: () => `<p>The longest detour allowed to avoid crossing a wall. A longer detour isn't taken, the nozzle goes straight. In mm, or as a % of the direct path. 0 means no limit.</p>`,
    effects: (ctx, v) => [['Travel', num(v) === 0 ? 'Any detour is allowed.' : 'Long detours are skipped.']],
    choices: () => [{value: '0', label: 'No limit', note: 'The default.'}, {value: '200%', label: '200%', note: 'Up to twice the direct path.'}],
    exact: () => ({min: 0, max: '', unit: 'mm or %'}),
  };

  S.small_area_infill_flow_compensation = {
    title: 'Small area flow compensation',
    explain: () => `<p>Very short infill lines in tiny areas often get too much plastic, because the nozzle can't reduce the flow fast enough. On, Elslicer gives short lines less plastic according to the model below.</p>`,
    effects: (ctx, v) => on(v) ? [['Looks', 'Fewer blobs on small solid areas.'], ['Note', 'Beta.']] : [['Looks', 'Small areas may be slightly overfilled.']],
    notes: {'1': 'Less plastic for short lines.', '0': 'Off.'},
  };

  S.small_area_infill_flow_compensation_model = {
    title: 'Flow compensation model',
    explain: () => `<p>A table of line lengths and how much plastic each gets: each line is "length, factor;". Lines shorter than the last length are scaled by the matching factor. Only change it if you have measured your printer.</p>`,
  };
})();
