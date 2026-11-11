// Settings guide: the Bridging and Overhangs sections of the Quality tab.
(() => {
  const {C, num, length, on, round, mm, svg, text, rect, line, bead, warn} = G;
  const S = window.SETTINGS;

  // A bridge across a gap seen from the front: strands hang between two pillars and sag in the middle.
  function bridge(o = {}) {
    const flow = num(o.flow) || 1, density = (num(o.density) || 100) / 100, thick = !!o.thick;
    const x0 = 140, x1 = 620, top = 110, pillarH = 110;
    const sag = Math.max(4, 40 * (flow * 0.9) / Math.max(0.4, density) * (thick ? 0.6 : 1) - (density < 1 ? 10 : 0));
    let body = text(20, 24, 'A bridge across a gap seen from the front: strands printed over thin air between two pillars');
    body += rect(x0 - 80, top, 80, pillarH, C.plastic2) + rect(x1, top, 80, pillarH, C.plastic2);
    const strands = thick ? 1 : 1;
    const sw = thick ? 14 : 8;
    body += `<path d="M${x0},${top} Q${(x0 + x1) / 2},${top + sag * 2} ${x1},${top}" fill="none" stroke="${C.accent}" stroke-width="${sw}"/>`;
    body += line(x0, top, x1, top, C.muted, {dash: '5 4'});
    body += text((x0 + x1) / 2, top + sag + 34, sag > 30 ? 'more sag in the middle' : sag < 15 ? 'little sag' : 'some sag in the middle', {anchor: 'middle', fill: sag > 25 ? C.warm : C.text});
    // From below: line spacing.
    const yb = 250, n = Math.round(14 * density);
    body += text(20, yb - 10, 'Seen from below:');
    for (let i = 0; i < n; ++i) body += rect(x0 + i * (x1 - x0) / Math.max(1, n), yb, Math.max(3, (x1 - x0) / 14 * 0.85 * Math.min(1.2, flow)), 40, C.accent, {rx: 3});
    body += text(x1 + 10, yb + 26, density < 1 ? 'gaps between strands' : density > 1 ? 'strands overlap' : 'strands touch', {size: 12});
    return svg(760, 310, body, o.caption);
  }

  window.SECTIONS['Bridging'] = {
    intro: () => `<p>A <b>bridge</b> is a stretch printed over thin air between two supports, like the top of a doorway, the roof of a hole or the first layer above sparse infill. The plastic hangs freely while it cools, so it sags a little.</p>
      <p>These settings change how much plastic goes into bridge lines, how close together they are and how thick, to balance sag against strength. <b>External</b> bridges are the ones you can see from below; <b>internal</b> bridges are hidden, printed over the infill to give the top a base.</p>`,
  };

  S.bridge_flow = {
    title: 'Bridge flow ratio',
    explain: () => `<p>How much plastic goes into the visible bridge lines, as a multiplier. Above 1, each strand is thicker and stronger but heavier, so it can sag more. Below 1, strands are thinner and lighter; they cool faster and sag less, and the lines are moved closer so they still touch.</p>`,
    picture: (ctx, v) => bridge({flow: v, density: ctx.values.bridge_density, thick: on(ctx.values.thick_bridges)}),
    effects: (ctx, v) => { const f = num(v); return [['Sagging', f < 0.95 ? 'Lighter strands: less sag.' : f > 1.05 ? 'Heavier strands: more sag.' : 'Normal.'], ['Strength', f < 0.9 ? 'Thin strands can snap on long spans.' : 'Normal.']]; },
    choices: () => [{value: '0.85', label: '0.85', note: 'Less sag.'}, {value: '0.95', label: '0.95', note: 'A little less.'}, {value: '1', label: '1', note: 'Normal.'}, {value: '1.1', label: '1.1', note: 'Stronger strands.'}],
  };

  S.internal_bridge_flow = {
    title: 'Internal bridge flow ratio',
    explain: () => `<p>The same, for the hidden bridges printed over sparse infill. A little more plastic (1.05-1.15) makes a firmer base, which helps the top above come out flat.</p>`,
    picture: (ctx, v) => bridge({flow: v, density: ctx.values.internal_bridge_density, thick: on(ctx.values.thick_internal_bridges), caption: 'The same idea, but hidden inside, over the infill.'}),
    effects: (ctx, v) => [['Tops', num(v) >= 1 ? 'A firm base for the top layers.' : 'A weaker base: tops can show bumps ("pillowing").']],
    choices: () => [{value: '1', label: '1', note: 'Normal.'}, {value: '1.1', label: '1.1', note: 'A firmer base.'}],
  };

  S.bridge_density = {
    title: 'External bridge density',
    explain: () => `<p>How close together the visible bridge strands are. 100% means they just touch. Above 100% they overlap and hold each other up, giving a smoother underside, but can overfill. Below 100% they leave gaps, which lets air cool them faster, but the underside is stringy.</p>`,
    picture: (ctx, v) => bridge({flow: ctx.values.bridge_flow, density: v, thick: on(ctx.values.thick_bridges)}),
    effects: (ctx, v) => { const d = num(v); return [['Looks', d > 105 ? 'A smoother, more closed underside.' : d < 90 ? 'Gaps between strands underneath.' : 'Strands touch.'], ['Risk', d > 125 ? warn('Above 125%: overfilled, warp-prone bridges.') : d < 50 ? 'A stringy, weak bridge.' : 'None.']]; },
    choices: () => [{value: '100%', label: '100%', note: 'The default.'}, {value: '110%', label: '110%', note: 'Smoother underside.'}, {value: '90%', label: '90%', note: 'Better cooling.'}],
  };

  S.internal_bridge_density = {
    title: 'Internal bridge density',
    explain: () => `<p>How close together the hidden bridge strands over the infill are. Denser gives a firmer base for the top; less dense cools better and can reduce bumps on the top, but supports it less.</p>`,
    effects: (ctx, v) => [['Tops', num(v) >= 100 ? 'A well-supported top.' : 'Less support under the top.']],
    choices: () => [{value: '100%', label: '100%', note: 'The default.'}, {value: '115%', label: '115%', note: 'Firmer base.'}],
  };

  S.thick_bridges = {
    title: 'Thick external bridges',
    explain: ctx => `<p>On, visible bridges are printed as round strands as tall as the nozzle is wide (${ctx.nozzle} mm), instead of flat ones as tall as a layer. Round strands are much stronger and span longer gaps, but look coarser from below.</p>`,
    picture: (ctx, v) => bridge({flow: ctx.values.bridge_flow, density: ctx.values.bridge_density, thick: on(v)}),
    effects: (ctx, v) => on(v) ? [['Strength', 'Reliable over long gaps.'], ['Looks', 'Coarser underside.']] : [['Strength', 'Fine for short gaps; long ones may droop.'], ['Looks', 'A neater underside.']],
    notes: {'1': 'Stronger, coarser.', '0': 'Neater, short spans.'},
  };

  S.thick_internal_bridges = {
    title: 'Thick internal bridges',
    explain: () => `<p>The same for the hidden bridges over infill. Usually left on: nobody sees them, and thick strands give the top a reliable base.</p>`,
    effects: (ctx, v) => on(v) ? [['Tops', 'A reliable base.']] : [['Tops', 'Can be less reliable over sparse infill.']],
    notes: {'1': 'Recommended.', '0': 'Thinner hidden bridges.'},
  };

  S.enable_extra_bridge_layer = {
    title: 'Extra bridge layers',
    explain: () => `<p>Adds a second bridge layer straight on top of the first, before the normal solid fill. The first bridge layer is weak and sags; the second, crossing it, firms it up so the solid layers above sit flat. It reduces bumps on tops and stops the bridge pulling away from the walls.</p>`,
    effects: (ctx, v) => v === 'disabled' ? [['Looks', 'Tops over bridges can show bumps on fast printers.']] : [['Looks', 'Flatter tops over bridges.'], ['Time', 'A little more time and plastic.']],
    notes: {disabled: 'One bridge layer.', external_bridge_only: 'Recommended: visible bridges.', internal_bridge_only: 'Hidden bridges only.', apply_to_all: 'Both.'},
  };

  S.dont_filter_internal_bridges = {
    title: 'Filter out small internal bridges',
    explain: () => `<p>Small areas of solid fill that sit slightly over the infill are normally printed straight onto it, without a bridge, to save time. On curved or sloped models with low infill, that fill can curl and cause bumps on the top. Less filtering adds bridges in those spots too.</p>`,
    effects: (ctx, v) => v === 'disabled' ? [['Time', 'Fastest.'], ['Tops', 'Slanted models may show bumps.']] : [['Tops', 'Smoother tops on curved models.'], ['Time', 'A little slower.']],
    notes: {disabled: 'Filter (default, fastest).', limited: 'Some extra bridges.', nofilter: 'Bridge everything.'},
  };

  S.counterbore_hole_bridging = {
    title: 'Bridge counterbore holes',
    explain: () => `<p>A counterbore is a wide recess with a narrower hole below it, like a pocket for a screw head. Printed upside down, the narrow hole floats over air. This builds bridges so it prints without support. <b>Sacrificial layer</b> covers the hole with a thin layer you poke through afterwards.</p>`,
    notes: {none: 'No bridge.', partiallybridge: 'Bridge part of it.', sacrificiallayer: 'A full layer to poke through.'},
  };

  // An overhanging wall seen from the side: each layer sticks out a bit further.
  function overhang(o = {}) {
    const x0 = 230, base = 220, lh = 16, n = 10, step = o.step || 9;
    let body = text(20, 24, 'An overhanging wall seen from the side: each layer sticks out a bit beyond the one below');
    body += rect(60, base, 640, 10, C.bed);
    for (let i = 0; i < n; ++i) {
      const x = x0 + i * step, droop = o.droop ? Math.min(6, i * 0.7) : 0;
      body += rect(x, base - (i + 1) * lh + droop, 120, lh - 1, i % 2 && o.reverse ? C.accent2 : C.accent, {rx: 5});
      if (o.reverse) body += text(x + 60, base - (i + 1) * lh + 12 + droop, i % 2 ? '←' : '→', {anchor: 'middle', fill: C.text, size: 12});
    }
    if (o.cone) body += `<polygon points="${x0},${base} ${x0 + n * step + 80},${base - n * lh} ${x0 + n * step + 120},${base - n * lh} ${x0 + 120},${base}" fill="${C.warm}" opacity="0.25"/>`;
    return svg(760, 245, body, o.caption);
  }

  window.SECTIONS['Overhangs'] = {
    intro: () => `<p>An <b>overhang</b> is a wall that leans outwards, so each layer sticks out a little beyond the one below and is partly printed over air. Gentle overhangs (up to about 45°) print fine; steeper ones droop and curl.</p>
      <p>These settings slow down and change how overhanging walls are printed, or change the shape so it prints without support.</p>`,
  };

  S.detect_overhang_wall = {
    title: 'Detect overhang walls',
    explain: () => `<p>Works out how much of each wall line hangs over air and slows it down accordingly (using the Overhang speeds in the Speed tab). A line fully over air is printed at bridge speed.</p>`,
    picture: (ctx, v) => overhang({droop: !on(v), caption: on(v) ? 'Overhanging lines slow down and stay in place.' : 'At full speed, overhanging lines droop and curl.'}),
    effects: (ctx, v) => on(v) ? [['Overhangs', 'Much cleaner overhangs.'], ['Time', 'A little slower where there are overhangs.']] : [['Overhangs', warn('Overhangs print at full speed and droop.')]],
    notes: {'1': 'Recommended.', '0': 'No special handling.'},
  };

  S.unsupported_wall_last = {
    title: 'Print unsupported walls last',
    explain: () => `<p>A wall loop that hangs completely in mid-air has nothing to stick to. On, it waits until something nearby is printed (the other walls or this layer's bridges) and is printed against that, innermost first.</p>`,
    effects: (ctx, v) => on(v) ? [['Overhangs', 'Floating loops have something to hold on to.']] : [['Overhangs', 'Floating loops print in normal order and may droop.']],
    notes: {'1': 'Wait for an anchor.', '0': 'Normal order.'},
  };

  S.make_overhang_printable = {
    title: 'Make overhangs printable',
    explain: () => `<p>Changes the model's shape: steep overhangs are filled underneath with a cone of plastic, so they lean no more than the angle below and print without supports. The part's look changes underneath.</p>`,
    picture: (ctx, v) => overhang({step: 13, cone: on(v), caption: on(v) ? 'The light area is added under the overhang to make it printable.' : 'The overhang is printed as modelled.'}),
    effects: (ctx, v) => on(v) ? [['Shape', warn('The part is changed underneath its overhangs.')], ['Supports', 'Often none needed.']] : [['Shape', 'As modelled.']],
    notes: {'1': 'Fill under steep overhangs.', '0': 'Keep the shape.'},
  };

  S.make_overhang_printable_angle = {
    title: 'Maximum angle',
    explain: () => `<p>The steepest overhang left after the change, from vertical. 90° changes nothing; 45° is safe on most printers; lower adds more material.</p>`,
    effects: (ctx, v) => [['Shape', num(v) >= 60 ? 'Small changes, some overhang remains.' : 'Bigger fills, very printable.']],
    choices: () => [{value: '55', label: '55°', note: 'The default.'}, {value: '45', label: '45°', note: 'Safer.'}],
  };

  S.make_overhang_printable_hole_size = {
    title: 'Hole area',
    explain: () => `<p>Holes in the part's base smaller than this area (in mm²) are filled with a cone too. 0 fills all of them.</p>`,
    choices: () => [{value: '0', label: '0', note: 'Fill all holes.'}, {value: '50', label: '50 mm²', note: 'Keep bigger holes.'}],
  };

  S.extra_perimeters_on_overhangs = {
    title: 'Extra perimeters on overhangs',
    explain: () => `<p>Adds extra wall loops over steep overhangs and where a bridge has nothing to anchor to. They grow outwards from the solid part, layer by layer, which holds the overhang better.</p>`,
    effects: (ctx, v) => on(v) ? [['Overhangs', 'Steep overhangs hold better.'], ['Time', 'A little more.']] : [['Overhangs', 'Normal.']],
    notes: {'1': 'Extra loops on overhangs.', '0': 'Normal.'},
  };

  S.overhang_reverse = {
    title: 'Reverse on even',
    explain: () => `<p>Walls with an overhang are printed in the opposite direction on every other layer. As plastic cools it pulls in the direction it was laid; alternating cancels that pull, so steep overhangs curl less. It also reduces warping.</p>`,
    picture: (ctx, v) => overhang({reverse: on(v), caption: on(v) ? 'Alternate layers go opposite ways, so the pull cancels.' : 'Every layer goes the same way.'}),
    effects: (ctx, v) => on(v) ? [['Overhangs', 'Steep overhangs curl less.'], ['Looks', 'The outer wall can look slightly different on alternate layers.']] : [['Overhangs', 'Normal.']],
    notes: {'1': 'Alternate direction.', '0': 'One direction.'},
  };

  S.overhang_reverse_internal_only = {
    title: 'Reverse only internal perimeters',
    explain: () => `<p>Applies the reversing only to the hidden inner walls, so the outer wall keeps its look while the inside still cancels stresses. Very good for warp-prone materials like ABS, ASA, TPU and silk PLA. Set the threshold below to 0 for best effect.</p>`,
    notes: {'1': 'Inner walls only.', '0': 'All walls.'},
  };

  S.overhang_reverse_threshold = {
    title: 'Reverse threshold',
    explain: () => `<p>How far a wall must overhang before it is reversed, in mm or as a % of the line width. 0 reverses every other layer regardless.</p>`,
    effects: (ctx, v) => [['Which walls', num(v) === 0 ? 'Every wall on every other layer.' : 'Only walls with a real overhang.']],
    choices: () => [{value: '50%', label: '50%', note: 'The default.'}, {value: '0', label: '0', note: 'Always reverse.'}],
    exact: () => ({min: 0, max: '', unit: 'mm or %'}),
  };
})();
