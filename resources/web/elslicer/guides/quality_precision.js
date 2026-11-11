// Settings guide: the Precision section of the Quality tab.
(() => {
  const {C, num, length, on, round, mm, svg, text, rect, line, warn} = G;
  const S = window.SETTINGS;

  // A peg in a hole from above, with the hole and outline grown or shrunk.
  function fit(holeDelta, contourDelta, caption) {
    const cx = 380, cy = 130, s = 60; // 60 px per mm, enlarged
    const hole = 1.0 + holeDelta, peg = 0.95;
    let body = text(20, 24, 'A peg in a printed hole from above, enlarged: dashed lines are the sizes in the model');
    const outer = 1.8 + contourDelta;
    body += `<rect x="${cx - outer * s}" y="${cy - outer * s * 0.55}" width="${outer * 2 * s}" height="${outer * 1.1 * s}" fill="${C.plastic2}" rx="8"/>`;
    body += `<rect x="${cx - 1.8 * s}" y="${cy - 1.8 * s * 0.55}" width="${3.6 * s}" height="${1.98 * s}" fill="none" stroke="${C.muted}" stroke-dasharray="5 4" rx="8"/>`;
    body += `<circle cx="${cx}" cy="${cy}" r="${hole * s * 0.9}" fill="${C.bg}"/>`;
    body += `<circle cx="${cx}" cy="${cy}" r="${1.0 * s * 0.9}" fill="none" stroke="${C.muted}" stroke-dasharray="5 4"/>`;
    body += `<circle cx="${cx}" cy="${cy}" r="${peg * s * 0.9}" fill="${C.warm}" opacity="0.8"/>`;
    const gap = hole - peg;
    body += text(cx, 250, gap < 0 ? 'The peg is bigger than the hole: it won\'t go in' : gap < 0.08 ? 'A tight press fit' : gap < 0.25 ? 'A sliding fit' : 'Loose: the peg rattles', {anchor: 'middle', fill: gap < 0 ? C.bad : C.text});
    return svg(760, 265, body, caption);
  }

  // The bottom few layers seen from the side, flaring out or pulled in.
  function foot(comp, layers, caption) {
    const x0 = 230, w = 300, base = 210, lh = 16, n = 9;
    let body = text(20, 24, 'The bottom of a wall seen from the side, enlarged');
    body += rect(60, base, 640, 10, C.bed);
    for (let i = 0; i < n; ++i) {
      const squash = i === 0 ? 14 : i === 1 ? 5 : 0;
      const pull = i < layers ? comp * 60 * (1 - i / Math.max(1, layers)) : 0;
      const grow = Math.max(-8, squash - pull);
      body += rect(x0 - grow, base - (i + 1) * lh, w + 2 * grow, lh - 1, i < 2 ? C.accent2 : C.plastic, {rx: 4});
    }
    body += line(x0, 40, x0, base, C.muted, {dash: '5 4'}) + line(x0 + w, 40, x0 + w, base, C.muted, {dash: '5 4'});
    body += text(x0 + w + 10, 60, 'dashed: the true size', {size: 12});
    return svg(760, 235, body, caption);
  }

  window.SECTIONS['Precision'] = {
    intro: () => `<p>A printer never reproduces a model exactly. The first layer is squashed and spreads out, holes come out a bit small, round shapes are made of short straight pieces, and the very top height rounds to the nearest layer.</p>
      <p>These settings correct those small errors. They matter most for parts that must fit together: lids, pegs, screws, gears, snap-fits. For a figurine you can usually leave them alone.</p>`,
  };

  S.slice_closing_radius = {
    title: 'Slice gap closing radius',
    explain: () => `<p>Models downloaded from the web often have tiny cracks between their triangles. When Elslicer cuts the model into layers, it closes any crack narrower than twice this value, so you don't get holes or missing walls.</p>
      <p>Too high, and it can also close tiny details you wanted, like a thin slot.</p>`,
    effects: (ctx, v) => { const r = num(v); return [['Repairs', r < 0.02 ? 'Only microscopic cracks are closed; broken models may slice with holes.' : r <= 0.1 ? `Closes cracks up to ${mm(2 * r)}: fixes most broken models without touching details.` : warn(`Closes gaps up to ${mm(2 * r)}: real slots and fine details may disappear.`)]]; },
    choices: () => [{value: '0.049', label: '0.049 mm', note: 'The default.'}, {value: '0.02', label: '0.02 mm', note: 'Keep finest slots.'}, {value: '0.1', label: '0.1 mm', note: 'For badly broken models.'}],
  };

  S.resolution = {
    title: 'Resolution',
    explain: () => `<p>A curve in the model is made of many tiny straight pieces. Elslicer merges pieces that differ from the true shape by less than this, so the printer gets fewer, longer moves.</p>
      <p>Smaller values keep curves truer but make bigger files and slow slicing; very tiny moves can also make the printer stutter.</p>`,
    effects: (ctx, v) => { const r = num(v); return [['Looks', r <= 0.01 ? 'Curves follow the model closely.' : r <= 0.05 ? 'Still smooth to the eye.' : 'Curves may show small flat facets.'], ['Slicing', r < 0.005 ? 'Slow slicing and large G-code.' : 'Normal.']]; },
    choices: () => [{value: '0.01', label: '0.01 mm', note: 'The default.'}, {value: '0.005', label: '0.005 mm', note: 'Finer, bigger files.'}, {value: '0.025', label: '0.025 mm', note: 'Coarser, smaller files.'}],
  };

  S.enable_arc_fitting = {
    title: 'Arc fitting',
    explain: () => `<p>Curves are normally sent to the printer as many short straight moves. Arc fitting replaces runs of them with single arc commands (G2/G3), which makes the file much smaller.</p>
      <p>Whether it helps depends on the firmware. Some printers draw arcs smoothly; Klipper turns them back into short lines, which can be slightly worse than Elslicer's own lines. The <b>Sparse infill only</b> option shrinks the file without touching anything you see.</p>`,
    effects: (ctx, v) => ({
      disabled: [['Looks', 'Straight moves only: predictable on every firmware.'], ['File', 'Larger G-code on curved models.']],
      enabled: [['Looks', 'Smooth on firmware that draws arcs well; slightly worse on Klipper.'], ['File', 'Much smaller G-code on curved models.']],
      sparse_infill: [['Looks', 'Walls and surfaces unchanged.'], ['File', 'Smaller G-code for curved infill patterns like gyroid.']],
    }[v] || []),
    notes: {disabled: 'Recommended for Klipper.', enabled: 'Arcs everywhere.', sparse_infill: 'Arcs only in the hidden infill.'},
  };

  S.xy_hole_compensation = {
    title: 'X-Y hole compensation',
    explain: () => `<p>Printed holes almost always come out a little smaller than designed: plastic is pushed slightly outwards into them, and round holes are drawn from straight pieces that cut the corner.</p>
      <p>This grows (positive) or shrinks (negative) every hole by the given amount, so a screw or peg fits. Measure a test hole with calipers: if a 5 mm hole prints at 4.8 mm, set about 0.1 mm (each side grows by this much).</p>`,
    picture: (ctx, v) => fit(num(v) - 0.05 + num(ctx.values.xy_contour_compensation || 0) * -1, num(ctx.values.xy_contour_compensation || 0), 'A typical printer makes holes about 0.1 mm small; this setting moves them back.'),
    effects: (ctx, v) => { const d = num(v); return [['Fit', d === 0 ? 'Holes come out a little small, as is usual.' : d > 0 ? `Holes are ${mm(2 * d)} wider across.` : `Holes are ${mm(-2 * d)} narrower across.`], ['Risk', Math.abs(d) > 0.3 ? warn('A large change: check that thin walls round the holes don\'t vanish.') : 'None.']]; },
    choices: () => [{value: '0', label: 'None', note: 'As modelled.'}, {value: '0.05', label: '+0.05 mm', note: 'A little looser.'}, {value: '0.1', label: '+0.1 mm', note: 'Common for pegs and screws.'}, {value: '0.15', label: '+0.15 mm', note: 'Looser still.'}],
    exact: () => ({min: -2, max: 2, unit: 'mm'}),
  };

  S.xy_contour_compensation = {
    title: 'X-Y contour compensation',
    explain: () => `<p>Grows or shrinks the outside of every part by this amount on each side. Plastic spreads a little beyond the planned line, so outsides tend to come out slightly big. A negative value pulls them back.</p>
      <p>Use it for parts that must slide into something, like a lid into a box.</p>`,
    picture: (ctx, v) => fit(num(ctx.values.xy_hole_compensation || 0) - 0.05, num(v) * 3, 'The outline grows or shrinks by the value on each side.'),
    effects: (ctx, v) => { const d = num(v); return [['Fit', d === 0 ? 'Outsides as modelled (often a hair big).' : d < 0 ? `Parts are ${mm(-2 * d)} smaller across.` : `Parts are ${mm(2 * d)} bigger across.`]]; },
    choices: () => [{value: '0', label: 'None', note: 'As modelled.'}, {value: '-0.05', label: '-0.05 mm', note: 'A little smaller.'}, {value: '-0.1', label: '-0.1 mm', note: 'For tight-fitting parts.'}],
    exact: () => ({min: -2, max: 2, unit: 'mm'}),
  };

  S.elefant_foot_compensation = {
    title: 'Elephant foot compensation',
    explain: () => `<p>The first layer is pressed hard into the bed so it sticks, and the weight of the layers above squeezes it further. It spreads outwards into a small lip around the bottom, called <b>elephant's foot</b>. It stops parts sitting flat against each other and makes the bottom edge measure too big.</p>
      <p>This shrinks the first layer inwards by the set amount to cancel the lip.</p>`,
    picture: (ctx, v) => foot(num(v), num(ctx.values.elefant_foot_compensation_layers) || 1, num(v) > 0 ? `The first layer is pulled in by ${mm(num(v))} on each side.` : 'With no compensation, the squashed bottom layers flare outwards.'),
    effects: (ctx, v) => { const d = num(v); return [['Looks', d === 0 ? 'A small lip at the bottom edge is likely.' : d <= 0.25 ? 'A straight bottom edge on most printers.' : 'The bottom may now be pulled in, giving a small groove.'], ['Sticking', d > 0.3 ? 'Slightly less first-layer area on the bed.' : 'No real change.']]; },
    choices: () => [{value: '0', label: 'None', note: 'Keep the lip.'}, {value: '0.1', label: '0.1 mm', note: 'Gentle.'}, {value: '0.15', label: '0.15 mm', note: 'Common.'}, {value: '0.25', label: '0.25 mm', note: 'Strong squash.'}],
    exact: () => ({min: 0, max: 1, unit: 'mm'}),
  };

  S.elefant_foot_compensation_layers = {
    title: 'Elephant foot compensation layers',
    explain: () => `<p>How many bottom layers get pulled in. The first is pulled in the full amount, and each layer after less, until this layer, so the bottom tapers back to the true size instead of stepping.</p>`,
    picture: (ctx, v) => foot(num(ctx.values.elefant_foot_compensation) || 0.15, num(v), `The pull-in fades out over ${num(v)} ${num(v) === 1 ? 'layer' : 'layers'}.`),
    effects: (ctx, v) => [['Looks', num(v) <= 1 ? 'Only the first layer is corrected.' : 'A gentle taper over the bottom layers: best when the second layer also bulges.']],
    choices: () => [{value: '1', label: '1 layer', note: 'The default.'}, {value: '2', label: '2 layers', note: 'If layer 2 also bulges.'}, {value: '3', label: '3 layers', note: 'Heavy parts.'}],
  };

  S.elefant_foot_layers_density = {
    title: 'Elephant foot layers density',
    explain: () => `<p>The bottom layers being pulled in can be printed less densely inside, so there's less plastic to squeeze out sideways. This is the density of the second layer's solid fill; later ones grow back to 100%.</p>`,
    effects: (ctx, v) => [['Looks', num(v) >= 100 ? 'Solid as normal.' : 'Less plastic to squash outward: a straighter bottom edge.'], ['Strength', num(v) < 70 ? 'The bottom is slightly weaker.' : 'No real change.']],
    choices: () => [{value: '100%', label: '100%', note: 'The default.'}, {value: '80%', label: '80%', note: 'Less squash.'}],
  };

  S.precise_outer_wall = {
    title: 'Precise wall',
    explain: () => `<p>Adjusts the spacing between the outer wall and the one behind it so the outside of the part lands exactly on the model's surface. It makes dimensions more accurate and the layers more even.</p>
      <p>It only works when the inner walls print before the outer one.</p>`,
    effects: (ctx, v) => on(v) ? [['Fit', 'Outer dimensions match the model more closely.'], ['Looks', 'More even layer lines.']] : [['Fit', 'The outside can be a few hundredths of a mm off.']],
    notes: {'1': 'More accurate outsides.', '0': 'The classic spacing.'},
  };

  S.precise_z_height = {
    title: 'Precise Z height',
    explain: ctx => `<p>A part's height is rarely an exact number of layers. Normally the last layer rounds it, so a 10.05 mm part might print 10.0 or 10.2 mm. On, Elslicer fine-tunes the last few layers' heights so the top lands exactly on the model's height.</p>
      ${G.tallest(ctx) ? `<p>${G.objectName(ctx)} is ${mm(G.tallest(ctx).height)} tall.</p>` : ''}`,
    effects: (ctx, v) => on(v) ? [['Fit', 'The height comes out as modelled.'], ['Note', 'Experimental.']] : [['Fit', `The height can be off by up to one layer (${mm(num(ctx.values.layer_height) || 0.2)}).`]],
    notes: {'1': 'Exact height.', '0': 'Rounded to whole layers.'},
  };

  S.hole_to_polyhole = {
    title: 'Convert holes to polyholes',
    explain: () => `<p>A small round hole printed as a circle comes out undersized, because the plastic is drawn round a tight curve and pulls inwards. A <b>polyhole</b> replaces it with a polygon of a few straight sides, sized so the circle you want fits inside. The flat sides print accurately, so pins and screws fit without drilling.</p>`,
    effects: (ctx, v) => on(v) ? [['Fit', 'Small vertical holes come out the right size.'], ['Looks', 'Holes show flat sides instead of a smooth circle.']] : [['Fit', 'Small holes print a bit tight.']],
    notes: {'1': 'Accurate small holes.', '0': 'Round holes.'},
  };

  S.hole_to_polyhole_threshold = {
    title: 'Polyhole detection margin',
    explain: () => `<p>How round a hole must be to be converted. Models store circles as many triangles, so the points don't sit exactly on a circle; this is how far off they may be. In mm, or a % of the radius.</p>`,
    effects: (ctx, v) => [['Which holes', num(v) <= 0.01 ? 'Only cleanly modelled round holes.' : 'Rougher, low-poly holes are also converted.']],
    choices: () => [{value: '0.01', label: '0.01 mm', note: 'The default.'}, {value: '0.05', label: '0.05 mm', note: 'Low-poly models.'}],
    exact: () => ({min: 0, max: '', unit: 'mm or %'}),
  };

  S.hole_to_polyhole_twisted = {
    title: 'Polyhole twist',
    explain: () => `<p>Rotates the polygon a little every layer, so its corners don't stack into ridges. The hole stays round on average and the pin slides more smoothly.</p>`,
    effects: (ctx, v) => on(v) ? [['Fit', 'A rounder hole overall; smooth for rotating pins.']] : [['Fit', 'Flat sides line up: good for a matching hex or flat key.']],
    notes: {'1': 'Rounder on average.', '0': 'Flat sides stay aligned.'},
  };

  S.hole_to_polyhole_max_edges = {
    title: 'Maximum polyhole edge count',
    explain: () => `<p>The most sides a polyhole can have. Bigger holes get more sides automatically; this caps it.</p>`,
    effects: (ctx, v) => [['Looks', num(v) <= 12 ? 'Clearly faceted large holes.' : 'Large holes stay close to round.']],
    choices: () => [{value: '50', label: '50', note: 'The default.'}, {value: '16', label: '16', note: 'Fewer facets.'}],
  };
})();
