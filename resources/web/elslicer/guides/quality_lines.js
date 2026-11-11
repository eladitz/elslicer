// Settings guide: the Line width section of the Quality tab.
(() => {
  const {C, num, length, mm, round, svg, text, rect, line, bead, warn, widthRisk} = G;

  // The width a line role ends up with: 0 means the Default line width, and a Default of 0 means automatic.
  const autoWidth = ctx => 1.125 * ctx.nozzle;
  const widthOf = (ctx, v) => {
    const w = length(v, ctx.nozzle);
    if (w > 0) return w;
    const d = length(ctx.values.line_width, ctx.nozzle);
    return d > 0 ? d : autoWidth(ctx);
  };
  const speedOf = (ctx, key) => {
    const v = ctx.values[key];
    if (v == null) return null;
    return G.isPercent(v) ? null : num(v);
  };

  // A line seen from its end, under the nozzle, at the chosen width.
  function picture(ctx, value, role) {
    const n = ctx.nozzle, w = widthOf(ctx, value), h = num(ctx.values.layer_height) || 0.2;
    const s = 300, cx = 380, base = 230;
    const half = n / 2 * s, nozzleY = base - h * s;
    let body = text(20, 24, `${role} line seen from its end, enlarged. Gold: the ${n} mm nozzle.`);
    // Neighbours either side, as lines lie side by side.
    for (const dx of [-w * s, w * s]) body += bead(cx + dx - w * s / 2, nozzleY, w * s, h * s, C.plastic2);
    body += bead(cx - w * s / 2, nozzleY, w * s, h * s, C.accent);
    body += `<path d="M${cx - half - 60},${nozzleY - 110} L${cx - half},${nozzleY - 4} L${cx + half},${nozzleY - 4} L${cx + half + 60},${nozzleY - 110} Z" fill="#c9a227"/>`;
    body += rect(cx - half * 0.55, nozzleY - 110, half * 1.1, 106, '#7a611a');
    body += line(20, base, 740, base, C.faint);
    body += line(cx - w * s / 2, base + 14, cx + w * s / 2, base + 14, C.text);
    body += text(cx, base + 32, `${mm(w)} wide`, {anchor: 'middle', fill: C.text});
    return svg(760, 280, body, `This line is ${round(w / n * 100, 0)}% of the nozzle's width and ${mm(h)} high. ` +
      (w > n ? 'Wider than the nozzle, the plastic is pressed out sideways under its flat tip.' : w < n ? 'Narrower than the nozzle, less plastic goes out than the opening could give.' : 'As wide as the nozzle.'));
  }

  // How much plastic per second that width needs at the speed set for it.
  function flow(ctx, value, speedKey, speedName) {
    const w = widthOf(ctx, value), h = num(ctx.values.layer_height) || 0.2, v = speedOf(ctx, speedKey);
    if (!v) return null;
    const need = w * h * v, limit = num(ctx.max_volumetric_speed);
    let out = `At your ${speedName} of ${round(v, 0)} mm/s this needs ${round(need, 1)} mm³ of plastic a second`;
    if (limit > 0)
      out += need > limit ? `, ${warn(`more than your filament's limit of ${round(limit, 1)} mm³/s, so the printer slows down to keep up`)}.` :
        `, within your filament's limit of ${round(limit, 1)} mm³/s.`;
    else out += '.';
    return ['Plastic per second', out];
  }

  const presets = (ctx, list) => list.map(([share, label, note]) => {
    const w = round(share * ctx.nozzle, 2);
    return {value: String(w), label: `${label}: ${w} mm`, note};
  });
  const exact = () => ({min: 0, max: 1000, step: 0.01, unit: 'mm or %'});
  const risk = (ctx, value) => {
    const r = widthRisk(widthOf(ctx, value), ctx.nozzle);
    return ['Risk', r ? warn(r) : 'None for this nozzle.'];
  };
  const zeroNote = (ctx, value) => length(value, ctx.nozzle) > 0 ? '' :
    `<p>It is set to 0, so it uses the Default line width: ${mm(widthOf(ctx, value))}.</p>`;

  window.SECTIONS['Line width'] = {
    intro: ctx => `<p>A printer lays plastic down in lines, like icing from a piping bag. These settings decide how wide each kind of line is: the outside walls you see, the walls behind them, the top you touch, the hidden infill, supports and bridges.</p>
      <p>The nozzle on <b>${ctx.printer}</b> is ${ctx.nozzle} mm. Lines are usually a little wider than the nozzle, because the plastic is pressed flat under its tip: that pressing is what makes lines stick to each other. Narrower lines look finer; wider lines are stronger and quicker, but need more plastic every second.</p>
      <p>A value can be in mm, or a % of the nozzle (100% = ${ctx.nozzle} mm). 0 means "use the Default line width".</p>`,
  };

  window.SETTINGS.line_width = {
    title: 'Default line width',
    explain: ctx => `<p>The width used for every kind of line that is set to 0 below. It is a starting point, so you can set one width and only change the kinds of line that need something different.</p>
      ${length(ctx.values.line_width, ctx.nozzle) > 0 ? '' : `<p>It is 0 now, so Elslicer works it out from the nozzle: about ${mm(autoWidth(ctx))}.</p>`}`,
    picture: (ctx, v) => picture(ctx, v, 'A'),
    effects: (ctx, v) => {
      const w = widthOf(ctx, v), n = ctx.nozzle;
      return [
        ['Looks', w <= 1.05 * n ? 'Fine, crisp lines and sharp small details.' : 'Slightly softer small details; flat areas look the same.'],
        ['Strength', w >= 1.1 * n ? 'Lines pressed wide bond well to their neighbours: strong.' : 'Good, as long as it stays above the nozzle width.'],
        ['Time', `Wider lines fill an area in fewer passes: ${round(w / n * 100, 0)}% of the nozzle here.`],
        risk(ctx, v),
      ];
    },
    choices: ctx => [{value: '0', label: 'Automatic', note: `About ${mm(autoWidth(ctx))} for this nozzle.`},
      ...presets(ctx, [[1, 'Nozzle width', 'Fine detail.'], [1.05, 'Standard', 'The usual choice.'], [1.125, 'Wide', 'A little stronger and faster.']])],
    exact,
  };

  window.SETTINGS.initial_layer_line_width = {
    title: 'First layer line width',
    explain: ctx => `<p>How wide the lines of the very first layer are, the one pressed onto the bed.</p>
      <p>Wider first-layer lines touch more of the bed, so the print holds on better, and they cover small dips in the bed. That is why it is usually set wider than the rest.</p>${zeroNote(ctx, ctx.values.initial_layer_line_width)}`,
    picture: (ctx, v) => picture(ctx, v, 'A first-layer'),
    effects: (ctx, v) => {
      const w = widthOf(ctx, v), n = ctx.nozzle;
      return [
        ['Sticking', w >= 1.2 * n ? 'Wide lines grip the bed over more area: the most reliable start.' : w >= 1.05 * n ? 'Good grip on a clean, level bed.' : 'Less grip: corners may lift on large or warp-prone prints.'],
        ['Looks', w >= 1.3 * n ? 'The bottom edge can bulge outwards slightly ("elephant\'s foot").' : 'The bottom face and edge stay neat.'],
        flow(ctx, v, 'initial_layer_speed', 'first-layer speed'),
        risk(ctx, v),
      ].filter(Boolean);
    },
    choices: ctx => [{value: '0', label: 'Same as default', note: 'Uses the Default line width.'},
      ...presets(ctx, [[1.125, 'Standard', 'Normal grip.'], [1.25, 'Wide', 'Better grip, a common choice.'], [1.5, 'Extra wide', 'For prints that won\'t stick.']])],
    exact,
  };

  window.SETTINGS.outer_wall_line_width = {
    title: 'Outer wall line width',
    explain: ctx => `<p>How wide the outermost line of every wall is: the one you see and touch.</p>
      <p>Because it is the outside, it decides how sharp corners, edges, text and small details come out. Narrower outer lines follow the shape more closely and look finer. It has little effect on strength, which comes from all the walls together.</p>${zeroNote(ctx, ctx.values.outer_wall_line_width)}`,
    picture: (ctx, v) => picture(ctx, v, 'An outer wall'),
    effects: (ctx, v) => {
      const w = widthOf(ctx, v), n = ctx.nozzle;
      return [
        ['Looks', w <= 1.05 * n ? 'Sharp corners and crisp small text; layer lines are fine and even.' : w <= 1.2 * n ? 'Slightly rounder corners; very small text softens.' : 'Rounded corners, and fine details blur.'],
        ['Detail', `The smallest feature it can draw is about ${mm(w)} wide.`],
        flow(ctx, v, 'outer_wall_speed', 'outer wall speed'),
        risk(ctx, v),
      ].filter(Boolean);
    },
    choices: ctx => [{value: '0', label: 'Same as default', note: 'Uses the Default line width.'},
      ...presets(ctx, [[1, 'Fine', 'Crispest outside, best for detail.'], [1.05, 'Standard', 'The usual choice.'], [1.125, 'Wide', 'Quicker, slightly softer.']])],
    exact,
  };

  window.SETTINGS.inner_wall_line_width = {
    title: 'Inner wall line width',
    explain: ctx => `<p>How wide the wall lines behind the outer one are. You don't see them, so they can be wider than the outer wall.</p>
      <p>Wider inner walls make a thicker, stronger wall with the same number of loops, and print faster.</p>${zeroNote(ctx, ctx.values.inner_wall_line_width)}`,
    picture: (ctx, v) => picture(ctx, v, 'An inner wall'),
    effects: (ctx, v) => {
      const w = widthOf(ctx, v), n = ctx.nozzle, loops = num(ctx.values.wall_loops) || 2;
      const outer = widthOf(ctx, ctx.values.outer_wall_line_width);
      return [
        ['Strength', `Your ${loops} walls make a shell about ${mm(outer + (loops - 1) * w)} thick. ${w >= 1.1 * n ? 'Wide inner lines bond strongly.' : ''}`],
        ['Looks', 'No visible change: these lines are hidden behind the outer wall.'],
        flow(ctx, v, 'inner_wall_speed', 'inner wall speed'),
        risk(ctx, v),
      ].filter(Boolean);
    },
    choices: ctx => [{value: '0', label: 'Same as default', note: 'Uses the Default line width.'},
      ...presets(ctx, [[1.05, 'Standard', 'Balanced.'], [1.125, 'Wide', 'Stronger walls, a common choice.'], [1.25, 'Extra wide', 'Strongest and fastest.']])],
    exact,
  };

  window.SETTINGS.top_surface_line_width = {
    title: 'Top surface line width',
    explain: ctx => `<p>How wide the lines of the topmost flat surfaces are: the top of a box, the face of a sign.</p>
      <p>Narrower lines close the surface more tightly and look smoother, with less visible pattern. It matters most on large flat tops.</p>${zeroNote(ctx, ctx.values.top_surface_line_width)}`,
    picture: (ctx, v) => picture(ctx, v, 'A top-surface'),
    effects: (ctx, v) => {
      const w = widthOf(ctx, v), n = ctx.nozzle;
      return [
        ['Looks', w <= 1.05 * n ? 'A smooth, tightly closed top with fine lines.' : 'The line pattern shows more, and small gaps can appear between lines.'],
        ['Time', w <= n ? 'More passes over each top: a little slower.' : 'Fewer passes: a little faster.'],
        flow(ctx, v, 'top_surface_speed', 'top surface speed'),
        risk(ctx, v),
      ].filter(Boolean);
    },
    choices: ctx => [{value: '0', label: 'Same as default', note: 'Uses the Default line width.'},
      ...presets(ctx, [[1, 'Fine', 'Smoothest tops.'], [1.05, 'Standard', 'The usual choice.'], [1.125, 'Wide', 'Faster tops.']])],
    exact,
  };

  window.SETTINGS.sparse_infill_line_width = {
    title: 'Sparse infill line width',
    explain: ctx => `<p>How wide the lines of the infill are: the light inner pattern that fills the part. Nobody sees them, so they are often the widest lines of the print.</p>
      <p>Wider infill lines make each strand of the pattern thicker, so the inside is stiffer at the same density, and it prints faster.</p>${zeroNote(ctx, ctx.values.sparse_infill_line_width)}`,
    picture: (ctx, v) => picture(ctx, v, 'An infill'),
    effects: (ctx, v) => {
      const w = widthOf(ctx, v), n = ctx.nozzle;
      return [
        ['Strength', w >= 1.1 * n ? 'Thick strands: a stiffer inside at the same density.' : 'Thinner strands: a little less stiff.'],
        ['Time', 'Wider strands fill the inside faster.'],
        flow(ctx, v, 'sparse_infill_speed', 'infill speed'),
        risk(ctx, v),
      ].filter(Boolean);
    },
    choices: ctx => [{value: '0', label: 'Same as default', note: 'Uses the Default line width.'},
      ...presets(ctx, [[1.05, 'Standard', 'Balanced.'], [1.125, 'Wide', 'A common choice.'], [1.25, 'Extra wide', 'Fastest and stiffest.']])],
    exact,
  };

  window.SETTINGS.internal_solid_infill_line_width = {
    title: 'Internal solid infill line width',
    explain: ctx => `<p>How wide the lines are in the solid layers hidden inside: the layers just under the top and above the bottom, which make the part solid there.</p>
      <p>They aren't seen, so a wider line is fine and saves time; they just need to close up well so the top above has a flat base.</p>${zeroNote(ctx, ctx.values.internal_solid_infill_line_width)}`,
    picture: (ctx, v) => picture(ctx, v, 'A solid infill'),
    effects: (ctx, v) => {
      const w = widthOf(ctx, v), n = ctx.nozzle;
      return [
        ['Looks', 'Hidden, but a well-closed solid layer gives the top above a flat base.'],
        ['Time', w >= 1.1 * n ? 'Wide lines: solid layers go quickly.' : 'Narrower lines: solid layers take longer.'],
        flow(ctx, v, 'internal_solid_infill_speed', 'solid infill speed'),
        risk(ctx, v),
      ].filter(Boolean);
    },
    choices: ctx => [{value: '0', label: 'Same as default', note: 'Uses the Default line width.'},
      ...presets(ctx, [[1.05, 'Standard', 'Balanced.'], [1.125, 'Wide', 'A common choice.']])],
    exact,
  };

  window.SETTINGS.support_line_width = {
    title: 'Support line width',
    explain: ctx => `<p>How wide the lines of support are: the temporary scaffolding under overhangs that you break off afterwards.</p>
      <p>Narrower support lines make thinner scaffolding that breaks away more easily and leaves less mark; wider lines make it sturdier, for tall or heavy overhangs.</p>${zeroNote(ctx, ctx.values.support_line_width)}`,
    picture: (ctx, v) => picture(ctx, v, 'A support'),
    effects: (ctx, v) => {
      const w = widthOf(ctx, v), n = ctx.nozzle;
      return [
        ['Removal', w <= 1.05 * n ? 'Thin scaffolding: breaks away easily.' : 'Sturdier scaffolding: takes more force to remove.'],
        ['Holding', w <= n ? 'Can wobble on tall supports.' : 'Holds tall or heavy overhangs steadily.'],
        flow(ctx, v, 'support_speed', 'support speed'),
        risk(ctx, v),
      ].filter(Boolean);
    },
    choices: ctx => [{value: '0', label: 'Same as default', note: 'Uses the Default line width.'},
      ...presets(ctx, [[1, 'Thin', 'Easiest to remove.'], [1.05, 'Standard', 'The usual choice.'], [1.125, 'Sturdy', 'For tall supports.']])],
    exact,
  };

  window.SETTINGS.bridge_line_width = {
    title: 'Bridge line width',
    format: v => G.isPercent(v) ? `${v} of the nozzle` : `${v} mm`,
    explain: ctx => `<p>How wide the lines are when the printer bridges a gap: printing straight across thin air from one support to another, like the top of a window opening.</p>
      <p>A bridge line hangs freely while it cools. Thinner lines cool and stiffen faster, so they sag less; that is why this can't be wider than the nozzle. 0 uses the solid infill width.</p>`,
    picture: (ctx, v) => picture(ctx, v, 'A bridge'),
    effects: (ctx, v) => {
      const w = Math.min(widthOf(ctx, v), ctx.nozzle), n = ctx.nozzle;
      return [
        ['Sagging', w <= 0.85 * n ? 'Thin strands cool quickly: little sag, but each strand is weaker.' : 'Full-width strands: stronger, but they stay soft longer and can droop.'],
        ['Looks', 'The underside of the bridge shows these lines.'],
        ['Tip', 'Thin bridge lines work best with a higher bridge density or flow (in the Bridging section).'],
      ];
    },
    choices: () => [{value: '100%', label: 'Nozzle width', note: 'Strongest strands.'},
      {value: '90%', label: '90%', note: 'A little less sag.'}, {value: '80%', label: '80%', note: 'Least sag, needs denser bridging.'},
      {value: '0', label: 'Solid infill width', note: 'Same as the solid layers.'}],
    exact: () => ({min: 0, max: 100, step: 1, unit: '% or mm'}),
  };
})();
